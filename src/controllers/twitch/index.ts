import { Controller } from "@/lib/base/controller";
import Communication from "@/lib/communication";
import { EncryptedField } from "@/lib/enc-field";
import { extendsClass, findFiles, importLocalModule, invalidateCache, parseDuration } from "@/lib/misc";
import chalk from "chalk";
import crypto from "crypto";
import { eq, RecordId, Table } from "surrealdb";
import { z, type ZodType } from "zod";
import TwitchClient from "./client";
import WaiterEvent, { type EventInfo, type TwitchEventInfo } from "./lib/base/WaiterEvent";
import { TwitchAuthDBSchema, type TwitchAuthDB } from "./types";

type StoredToken = {
  streamer: {
    id: RecordId;
    twitch: {
      display_name: string;
      login: string;
      id: RecordId;
    }
  };
  auth: string;
};

function deepSortObject(obj: any): any {
if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepSortObject);
  }

  // Sort keys alphabetically
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = deepSortObject(obj[key]);
      return acc;
    }, {});
}

// Use a Set of hashes for deduplication of Twitch event registrations (API and handler)
const registeredTwitchEventHashes = new Set<string>();


export default class TwitchController extends Controller {
  constructor() {
    super("TWCH", "#8956FB");
  }

  private client: TwitchClient;

  private streamerInit = async (client: TwitchClient) => {
    if (!Object.keys(global.twitch.streamerData).includes(client.IAM.id)) {
      global.twitch.streamerData[client.IAM.id] = {};
    }
  }

  public override async statuses(): Promise<void> {
    this.logger.log(`Currently connected to ${chalk.yellow(global.twitch.streamers.size)} Twitch account${global.twitch.streamers.size !== 1 ? "s" : ""}${global.twitch.streamers.size > 0 ? ":" : "."}`);
    for (const streamer of global.twitch.streamers.values()) {
      this.logger.log(`  - ${chalk.yellow(streamer.IAM.display_name)} ${chalk.dim(`(ID: ${chalk.yellow(streamer.IAM.id)})`)}`);
    }
    this.logger.log(`Connected to Twitch as ${chalk.yellow(this.client.IAM.display_name)} ${chalk.dim(`(ID: ${chalk.yellow(this.client.IAM.id)})`)} for bot operations.`);
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      twitch: z.object({
        authEndpoint: z.string()
          .describe("The endpoint for Twitch authentication")
          .default("/twitch/auth")
          .refine((endpoint: string) => endpoint.startsWith("/"), "Auth endpoint must start with a slash"),
        generatedCodeValidity: z.string()
          .describe("The validity duration for generated Twitch auth codes. Supports values accepted by parseDuration, such as '15m', '1h 30m', '2mo', '1w2d', and '500ms'.")
          .default("15m")
          .refine((duration: string) => {
            return !Number.isNaN(parseDuration(duration));
          }, "Generated code validity must be a valid duration string supported by parseDuration, such as '15m', '1h 30m', or '2mo'.")
      }).default({ authEndpoint: "/twitch/auth", generatedCodeValidity: "15m" }),
    }) satisfies z.ZodType<Pick<WaiterConfig, "twitch">>;
  }

  public async exec() {

    if (!global.twitch) global.twitch = {
      controller: this,
      communication: new Communication(),
      streamers: new Map(),
      streamerData: {},
      bypasses: new Set(),
    };

    const events = (await Promise.all(
      findFiles(global.isCompiled ? "dist" : "src", /\/twitch\/.*\.evt\..s$/)
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterEvent)) as (new (bot: TwitchClient) => WaiterEvent)[];

    await this.createBot();
    await this.createStreamers(this.streamerInit.bind(this));

    let instantiatedEvents = events.map((EventClass) => new EventClass(this.client));
    
    for (const event of instantiatedEvents) {
      
      const setupResult = await event.setup([this.client, ...global.twitch.streamers.values()]);
      
      if (setupResult) continue
      
      if (setupResult === false) {
        this.logger.error(`Failed to setup event: ${event.constructor.prototype.name}. Skipping registration of this event.`);
      }
      
      instantiatedEvents = instantiatedEvents.filter((e) => e !== event);
      
    }
    this.registerOnStartEvents(instantiatedEvents);

    await this.registerTwitchEvents(instantiatedEvents);


    const streamerTokensLive = await global.db.live(new Table("streamer_tokens")).where(eq("type", "twitch")).fetch("streamer", "streamer.twitch", "streamer.discord", "streamer.spotify");

    streamerTokensLive.subscribe(async (event) => {
      const displayName =
        (event.value as any).streamer.twitch?.display_name ||
        (event.value as any).streamer.discord?.display_name ||
        (event.value as any).streamer.spotify?.display_name ||
        "Unknown";

      const id =
        (event.value as any).streamer.twitch?.id.id.toString() ||
        (event.value as any).streamer.discord?.id.id.toString() ||
        (event.value as any).streamer.spotify?.id.id.toString() ||
        "??????";
      if (event.action === "CREATE") {
        const encryptedAuth = EncryptedField.fromDB((event.value as any).auth);

        if (!encryptedAuth.isSet()) {
          return;
        }

        console.info(`A Twitch token was created for ${displayName} (ID: ${id}). Attempting to set up Twitch client for this streamer...`);

        let auth: TwitchAuthDB;
        
        try {
          if (!encryptedAuth.validate()) {
            throw new Error("Encrypted auth field is not valid. Decryption failed.");
          }
          const unvalidatedAuth = encryptedAuth.get();
          const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
          if (!parsedAuth.success)
            throw new Error(parsedAuth.error.message);
          auth = parsedAuth.data;
        } catch (error) {
          this.logger.error("Error parsing stored Twitch auth for new streamer token:", error?.message || error);
          this.logger.debug("Clearing invalid Twitch auth from database for streamer token with ID " + (event.value as any).id);
          await global.db.query('DELETE streamer_tokens WHERE id = $tokenId', {
            tokenId: (event.value as any).id
          });
          return; // Abort processing this event
        }
        
        const newClient = await TwitchClient.createStreamer(auth, (event.value as any).streamer?.id.id.toString() ?? null, false);

        await this.createStreamers(async (client) => {
          if (client.IAM.id === newClient.IAM.id) {
            this.streamerInit.bind(this)(client);
            return true;
          }
          return false;
        });
        
        for (const event of instantiatedEvents) {
          event.setup([global.twitch.streamers.get(newClient.IAM.id)]);
        }
        this.registerOnStartEvents(instantiatedEvents, [global.twitch.streamers.get(newClient.IAM.id)]);
        await this.registerTwitchEvents(instantiatedEvents);


        await this.client.sendWhisper(newClient.IAM.id, `Welcome ${newClient.IAM.display_name}! This Twitch account has been successfully linked to Waiter. You can now use Twitch-related commands and features in your stream.`);

        this.logger.great(`New streamer added: ${chalk.yellow(newClient.IAM.display_name)} (ID: ${chalk.yellow(newClient.IAM.id)})`); 
        await invalidateCache(newClient.IAM.id);

      } else if (event.action === "DELETE") {
        const deletedStreamerId = (event.value as any).streamer?.twitch?.id.id.toString();

        if (!deletedStreamerId) {
          this.logger.warn("Received DELETE event for Twitch token without streamer ID. Cannot determine which streamer was deleted. Ignoring.");
          return;
        }

        const deletedStreamer = global.twitch.streamers.get(deletedStreamerId);

        if (!deletedStreamer) {
          this.logger.warn(`Received DELETE event for Twitch token with streamer ID ${deletedStreamerId}, but no active streamer instance was found for that ID. This likely means the token was deleted before the streamer was fully set up, or there is some other issue. Ignoring.`);
          return;
        }

        this.logger.warn(`Twitch token for ${deletedStreamer.IAM.display_name} (ID: ${deletedStreamer.IAM.id}) was deleted from database. We will disconnect from Twitch and stop watching this streamer.`);

        if (deletedStreamer) {
          await deletedStreamer.cleanup();
        }

        global.twitch.streamers.delete(deletedStreamerId);
        delete global.twitch.streamerData[deletedStreamerId];

        await invalidateCache(deletedStreamerId);

        this.logger.log("Successfully cleaned up after deleted Twitch token.");
      }
    })
  }

  public registerOnStartEvents(events: WaiterEvent[], clients = [this.client, ...global.twitch.streamers.values()]) {
    for (const event of events) {
      const trigger = event.eventTrigger({broadcaster: null, sender: null});

      if (trigger.type === "Waiter:start") {
        event.exec(clients);
      }
    }
  }

  public async registerTwitchEvents(events: WaiterEvent[]) {
    if (!this.client) {
      this.logger.warn("Tried to register Twitch events before Twitch client was initialized. This should not happen.");
      return;
    }

    for (const event of events) {
      let toRegister: EventInfo[] = [];
      if (global.twitch.streamers.size > 0) {
        for (const streamer of global.twitch.streamers.values()) {
          toRegister = toRegister.concat(
            event.eventTrigger({ broadcaster: streamer, sender: this.client }),
            event.registerTwitchEvents({ broadcaster: streamer, sender: this.client }).map((info) => ({ type: "Twitch:event", event: info }))
          );
        }
      } else {
        toRegister = toRegister.concat(
          event.eventTrigger({ broadcaster: null, sender: this.client }),
          event.registerTwitchEvents({ broadcaster: null, sender: this.client }).map((info) => ({ type: "Twitch:event", event: info }))
        );
      }

      toRegister = toRegister
        .filter((info) => info.type === "Twitch:event")
        .filter((info) => {
          if (info.event.condition.hasOwnProperty("broadcaster_user_id") && [null, undefined].includes((info.event.condition as { broadcaster_user_id: string }).broadcaster_user_id)) {
            return false;
          }
          return true;
        })
        .filter((info, index, self) => index === self.findIndex((i) => i.event.name === info.event.name && i.event.as === info.event.as && i.event.version === info.event.version && JSON.stringify(i.event.condition) === JSON.stringify(info.event.condition)))
        .map((info) => {
          info.event.version = info.event.version.toString() as any;
          return info;
        });

      for (const eventInfo of (toRegister as { type: "Twitch:event", event: TwitchEventInfo }[])) {
        const normalizedEvent = deepSortObject(eventInfo.event);
        const eventHash = crypto.createHash("sha256").update(JSON.stringify(normalizedEvent)).digest("hex");

        // If already registered, skip ALL registration and handler setup
        if (registeredTwitchEventHashes.has(eventHash)) {
          continue;
        }

        // Register with Twitch API (EventSub) and set up handler
        if (eventInfo.event.as === "sender") {
          if (!this.client.wantsToConnectToEventSub) {
            await this.client.enableEventSub();
          }
          await this.client.awaitConnection();
          await this.client.listen(eventInfo.event.name, eventInfo.event.version, eventInfo.event.condition);
          this.client.events.on(eventInfo.event.name, event.exec.bind(event));
          this.client.registeredEventsHash.push(eventHash);
        } else if (eventInfo.event.as === "broadcaster") {
          for (const streamer of global.twitch.streamers.values()) {
            if (!streamer.wantsToConnectToEventSub) {
              await streamer.enableEventSub();
            }
            await streamer.awaitConnection();
            await streamer.listen(eventInfo.event.name, eventInfo.event.version, eventInfo.event.condition);
            streamer.events.on(eventInfo.event.name, event.exec.bind(event));
            streamer.registeredEventsHash.push(eventHash);
          }
        }

        // Add hash to global set to prevent future duplicate registration
        registeredTwitchEventHashes.add(eventHash);
      }
    }
  }


  public async createBot() {
    this.client = await TwitchClient.createBot(false);
    return this.client;
  }

  public async createStreamers(streamerInit = async (client: TwitchClient) => true) {
    const storedTokens: StoredToken[] = (await global.db.query("SELECT streamer, auth FROM streamer_tokens WHERE type = 'twitch' FETCH streamer, streamer.twitch").collect().then((res)=>res[0] as StoredToken[]))
      .filter(token => !global.twitch.streamers.has(token.streamer.twitch.id.id.toString())); // Only attempt to create streamers for tokens that don't already have a streamer instance


    for (const tokenRecord of storedTokens) {
      this.logger.debug(`Found stored token for streamer: ${tokenRecord.streamer.twitch?.display_name} (${tokenRecord.streamer.twitch?.login})`);
      
      const encryptedAuth = EncryptedField.fromDB(tokenRecord.auth);
      let auth: TwitchAuthDB;

      if (encryptedAuth.isSet()) {
        try {
          if (!encryptedAuth.validate()) {
            throw new Error("Encrypted auth field is not valid. Decryption failed.");
          }
          const unvalidatedAuth = encryptedAuth.get();
          const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
          if (!parsedAuth.success)
            throw new Error(parsedAuth.error.message);
          auth = parsedAuth.data;
        } catch (error) {
          this.logger.error("Error parsing stored Twitch auth:", error?.message || error);
          this.logger.debug("Clearing invalid Twitch auth from database.");
          await global.db.query('DELETE streamer_tokens WHERE streamer = $streamerId AND type = "twitch"', {
            streamerId: tokenRecord.streamer.id
          });
          continue; // Skip to next token
        }
      }

      if (!auth) {
        this.logger.warn(`No valid auth found for streamer ${tokenRecord.streamer.twitch?.display_name} (${tokenRecord.streamer.twitch?.login}). Skipping.`);
        continue;
      }
      
      const client = await TwitchClient.createStreamer(auth, tokenRecord.streamer?.id.id.toString() ?? null, false);
      global.twitch.streamers.set(client.IAM.id, client);
      await streamerInit(client);
    }
  }
}
