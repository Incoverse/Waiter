import { Controller } from "@/lib/base/controller";
import { EncryptedField } from "@/lib/enc-field";
import { EnvironmentManager } from "@/lib/envmgr";
import { extendsClass, getAllModules, importLocalModule } from "@/lib/misc";
import crypto from "crypto";
import _ from "lodash";
import { RecordId } from "surrealdb";
import TwitchClient, { comm as TwitchClientCommunication } from "./client";
import WaiterEvent from "./lib/base/WaiterEvent";
import { TwitchAuthDBSchema, type TwitchAuthDB } from "./typecheck";

type StoredToken = {
  streamer: {
    display_name: string;
    login: string;
    id: RecordId;
  };
  auth: string;
};

let registeredTwitchEvents: { name: string; as: string; version: number; condition: any }[] = [];


export default class TwitchController extends Controller {
  constructor() {
    super("TWCH");
  }

  private client: TwitchClient;

  public streamers: Map<string, TwitchClient> = new Map();

  private requiredPEInits = {
    sender: {
      eventsub: false
    },
    broadcaster: {
      eventsub: false
    }
  }


  public async exec() {

    const events = (await Promise.all(
      (await getAllModules(".", /controllers\/twitch\/.*\.evt\..s$/)).map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterEvent)) as (new (bot: TwitchClient) => WaiterEvent)[];

    for (const event of events) {

      const instantiatedEvent = new event(this.client);

      const eventInfo = instantiatedEvent.eventTrigger({broadcaster: null, sender: null});
      const additionalEvents = instantiatedEvent.registerTwitchEvents({broadcaster: null, sender: null});

      if (eventInfo.type === "Twitch:event") {
        const twitchClient = eventInfo.event.as.toLowerCase() as "sender" | "broadcaster";
        this.requiredPEInits[twitchClient]["eventsub"] = true;
      }

      for (const additionalEvent of additionalEvents) {
        const twitchClient = additionalEvent.as.toLowerCase() as "sender" | "broadcaster";
        this.requiredPEInits[twitchClient]["eventsub"] = true;
      }
    }

    let instantiatedEvents = events.map((EventClass) => new EventClass(this.client));
    
    for (const event of instantiatedEvents) {
      
      const setupResult = await event.setup();
      
      if (setupResult) continue
      
      if (setupResult === false) {
        this.logger.error(`Failed to setup event: ${event.constructor.prototype.name}. Skipping registration of this event.`);
      }
      
      instantiatedEvents = instantiatedEvents.filter((e) => e !== event);
      
    }
    this.registerOnStartEvents(instantiatedEvents);
    

    await this.createBot();
    this.registerTwitchEvents(instantiatedEvents);


    await this.createStreamers(async (client) => {
      try {
        this.registerTwitchEvents(instantiatedEvents);
        return true;
      } catch (error) {
        this.logger.error(`Error registering Twitch events for streamer ${client.IAM.display_name} (${client.IAM.login}):`, error);
        return false;
      }
    });

    TwitchClientCommunication.on("new-streamer-auth", async (data) => {
      this.logger.debug("Received new streamer auth through TwitchClient communication channel");
      const userInfo = await TwitchClient.getUserInfo(data.accessToken);

      if (!userInfo) {
        this.logger.error("Failed to fetch user info for new streamer auth. Aborting streamer creation.");
        return;
      }

      await global.db.query(
        `UPSERT twitch_users:\`${userInfo.id}\` SET login = $login, display_name = $display_name`,
        { login: userInfo.login, display_name: userInfo.display_name }
      );

      const encryptedAuth = new EncryptedField({
        ...data,
        clientId: EnvironmentManager.get("TWITCH_CLIENT_ID"),
        clientSecret: EnvironmentManager.get("TWITCH_CLIENT_SECRET")
      });

      await global.db.query(
        `INSERT INTO streamer_tokens (streamer, type, auth) VALUES ($streamer, 'twitch', $encryptedAuth)`,
        {
          streamer: new RecordId("twitch_users", userInfo.id),
          encryptedAuth: encryptedAuth.toDB()
        }
      );

      await this.createStreamers(async (client) => {
        if (client.IAM.id === userInfo.id) {
          try {
            this.registerTwitchEvents(instantiatedEvents);
            return true;
          } catch (error) {
            this.logger.error(`Error registering Twitch events for new streamer ${client.IAM.display_name} (${client.IAM.login}):`, error);
            return false;
          }
        } else {
          return false; // Not the streamer we just added, no need to register events
        }
      })

    })    
  }

  public registerOnStartEvents(events: WaiterEvent[]) {
    for (const event of events) {
      const trigger = event.eventTrigger({broadcaster: null, sender: null});

      if (trigger.type === "Waiter:start") {
        event.exec([this.client, ...this.streamers.values()]);
      }
    }
  }

  public registerTwitchEvents(events: WaiterEvent[]) {

    if (!this.client) {
      this.logger.error("Tried to register Twitch events before Twitch client was initialized. This should not happen.");
      return;
    }

    for (const event of events) {
      let registeredEvents = []



      if (this.streamers.size > 0) {
        for (const streamer of this.streamers.values()) {
          registeredEvents = registeredEvents.concat(
            event.eventTrigger({broadcaster: streamer, sender: this.client}),
            event.registerTwitchEvents({broadcaster: streamer, sender: this.client}).map(e => ({ type: "Twitch:event", event: e }))
          );
        }
      } else {
        registeredEvents = registeredEvents.concat(
          event.eventTrigger({broadcaster: null, sender: this.client}),
          event.registerTwitchEvents({broadcaster: null, sender: this.client}).map(e => ({ type: "Twitch:event", event: e }))
        );
      }

      for (const eventInfo of registeredEvents) {
        if (eventInfo.type === "Twitch:event") {
            const alreadyRegistered = registeredTwitchEvents.some(e =>
              _.isEqual(e.name, eventInfo.event.name) &&
              _.isEqual(e.as, eventInfo.event.as) &&
              _.isEqual(e.version, eventInfo.event.version) &&
              _.isEqual(e.condition, eventInfo.event.condition)
            );

            if (!alreadyRegistered) {
              if (eventInfo.event.as === "broadcaster") {
                this.streamers.values().forEach(s => s.listen(eventInfo.event.name, eventInfo.event.version, eventInfo.event.condition));
              } else {
                this.client.listen(eventInfo.event.name, eventInfo.event.version, eventInfo.event.condition);
              }

              registeredTwitchEvents.push(eventInfo.event);
            }

            const hashedEvent = crypto.createHash("sha256").update(JSON.stringify(eventInfo.event)).digest("hex");
            if (eventInfo.event.as === "broadcaster") {

              
              this.streamers.values().forEach(s => {
                if (!s.registeredEventsHash.includes(hashedEvent)) {
                  s.events.on(eventInfo.event.name, event.exec.bind(event));
                  s.registeredEventsHash.push(hashedEvent);
                }
              });
            } else {

              if (!this.client.registeredEventsHash.includes(hashedEvent)) {
                this.client.events.on(eventInfo.event.name, event.exec.bind(event));
                this.client.registeredEventsHash.push(hashedEvent);
              }
            }
        }
      }

    }
  }


  public async createBot() {
    this.client = await TwitchClient.createBot(this.requiredPEInits.sender.eventsub);
    return this.client;
  }

  public async createStreamers(streamerInit = async (client: TwitchClient) => true) {
    const storedTokens: StoredToken[] = (await global.db.query("SELECT streamer, auth FROM streamer_tokens WHERE type = 'twitch' FETCH streamer").collect().then((res)=>res[0] as StoredToken[]))
      .filter(token => !this.streamers.has(token.streamer.id.id.toString())); // Only attempt to create streamers for tokens that don't already have a streamer instance


    for (const tokenRecord of storedTokens) {
      this.logger.debug(`Found stored token for streamer: ${tokenRecord.streamer.display_name} (${tokenRecord.streamer.login})`);
      
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
          await global.db.query('DELETE streamer_tokens WHERE streamer.id = $streamerId AND type = "twitch"', {
            streamerId: tokenRecord.streamer.id
          });
          continue; // Skip to next token
        }

        this.logger.great("Twitch auth loaded from database.");
      }

      if (!auth) {
        this.logger.warn(`No valid auth found for streamer ${tokenRecord.streamer.display_name} (${tokenRecord.streamer.login}). Skipping.`);
        continue;
      }
      
      const client = await TwitchClient.createStreamer(auth, this.requiredPEInits.broadcaster.eventsub);
      this.streamers.set(client.IAM.id, client);
      await streamerInit(client);
    }
  }
}
