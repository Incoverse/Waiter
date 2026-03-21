import { Controller } from "@/lib/base/controller";
import Communication from "@/lib/communication";
import { EncryptedField } from "@/lib/enc-field";
import { EnvironmentManager } from "@/lib/envmgr";
import { extendsClass, getAllModules, importLocalModule } from "@/lib/misc";
import crypto from "crypto";
import _ from "lodash";
import { RecordId } from "surrealdb";
import TwitchClient, { comm as TwitchClientCommunication } from "./client";
import WaiterEvent, { type EventInfo, type TwitchEventInfo } from "./lib/base/WaiterEvent";
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

  private streamerInit = async (client: TwitchClient) => {
    if (!Object.keys(global.twitch.streamerData).includes(client.IAM.id)) {
      global.twitch.streamerData[client.IAM.id] = {};
    }
  }

  public async exec() {

    if (!global.twitch) global.twitch = {
      controller: this,
      communication: new Communication(),
      streamers: new Map(),
      streamerData: {},
    };

    const events = (await Promise.all(
      (await getAllModules(".", /controllers\/twitch\/.*\.evt\..s$/)).map(importLocalModule)        
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
          this.streamerInit.bind(this)(client);
          return true;
        }
        return false;
      });
      await this.registerTwitchEvents(instantiatedEvents);

      for (const event of instantiatedEvents) {
        event.setup([global.twitch.streamers.get(userInfo.id)]);
      }
    })    
  }

  public registerOnStartEvents(events: WaiterEvent[]) {
    for (const event of events) {
      const trigger = event.eventTrigger({broadcaster: null, sender: null});

      if (trigger.type === "Waiter:start") {
        event.exec([this.client, ...global.twitch.streamers.values()]);
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
          )
        }

      } else {
        toRegister = toRegister.concat(
          event.eventTrigger({ broadcaster: null, sender: this.client }),
          event.registerTwitchEvents({ broadcaster: null, sender: this.client }).map((info) => ({ type: "Twitch:event", event: info }))
        )
      }



      toRegister = toRegister
        .filter((info) => info.type === "Twitch:event")
        .filter((info) => {
          if (info.event.condition.hasOwnProperty("broadcaster_user_id") && [null,undefined].includes((info.event.condition as { broadcaster_user_id: string }).broadcaster_user_id)) {
            return false; // Streamers were probably not loaded when this event was registered, so skip registering this event for now. It will be registered properly when streamers are loaded.
          }
          return true
        })
        // remove duplicates
        .filter((info, index, self) => index === self.findIndex((i) => i.event.name === info.event.name && i.event.as === info.event.as && i.event.version === info.event.version && JSON.stringify(i.event.condition) === JSON.stringify(info.event.condition)))
        .map((info) => {
          info.event.version = info.event.version.toString() as any; // Ensure version is a string, as required by Twitch API
          return info;
        })

      const clientNeedsEventsub = (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).some((info) => info.event.as === "sender")
      const broadcasterNeedsEventsub = (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).some((info) => info.event.as === "broadcaster")

      
      for (const eventInfo of (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[])) {

        const alreadyRegistered = registeredTwitchEvents.some(e =>
            _.isEqual(e.name, eventInfo.event.name) &&
            _.isEqual(e.as, eventInfo.event.as) &&
            _.isEqual(e.version, eventInfo.event.version) &&
            _.isEqual(e.condition, eventInfo.event.condition)
        );


        if (!alreadyRegistered) {
          if (clientNeedsEventsub && !this.client.wantsToConnectToEventSub) {
            await this.client.enableEventSub();
          }

          await this.client.awaitConnection()
          for (const info of (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).filter((info) => info.event.as === "sender")) {
            await this.client.listen(info.event.name, info.event.version, info.event.condition);
            registeredTwitchEvents.push(info.event as any);
            this.logger.withPrefix(`[${this.client.IAM.login}]`).debug(`Registered Twitch event: ${info.event.name} (version ${info.event.version}) for sender client with condition:`, JSON.stringify(info.event.condition));
          }


          if (broadcasterNeedsEventsub) {
            for (const streamer of global.twitch.streamers.values()) {
              if (!streamer.wantsToConnectToEventSub) {
                await streamer.enableEventSub();
              }

              await streamer.awaitConnection();

              for (const info of (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).filter((info) => info.event.as === "broadcaster")) {
                await streamer.listen(info.event.name, info.event.version, info.event.condition);
                registeredTwitchEvents.push(info.event as any);
                this.logger.withPrefix(`[${streamer.IAM.login}]`).debug(`Registered Twitch event: ${info.event.name} (version ${info.event.version}) for broadcaster client with condition:`, JSON.stringify(info.event.condition));
              }
            }
          }
        }

        for (const info of (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).filter((info) => info.event.as === "sender")) {
          
          const hashedInfo = crypto.createHash("sha256").update(JSON.stringify(info.event)).digest("hex");
          
          if (!this.client.registeredEventsHash.includes(hashedInfo)) {
            this.client.events.on(info.event.name, event.exec.bind(event));
            this.client.registeredEventsHash.push(hashedInfo);
          }
        }

        for (const info of (toRegister as {type: "Twitch:event", event: TwitchEventInfo}[]).filter((info) => info.event.as === "broadcaster")) {
          const hashedInfo = crypto.createHash("sha256").update(JSON.stringify(info.event)).digest("hex");
          for (const streamer of global.twitch.streamers.values()) {
            if (!streamer.registeredEventsHash.includes(hashedInfo)) {
              streamer.events.on(info.event.name, event.exec.bind(event));
              streamer.registeredEventsHash.push(hashedInfo);
            }
          }
        }

      }


    }


  }


  public async createBot() {
    this.client = await TwitchClient.createBot(false);
    return this.client;
  }

  public async createStreamers(streamerInit = async (client: TwitchClient) => true) {
    const storedTokens: StoredToken[] = (await global.db.query("SELECT streamer, auth FROM streamer_tokens WHERE type = 'twitch' FETCH streamer").collect().then((res)=>res[0] as StoredToken[]))
      .filter(token => !global.twitch.streamers.has(token.streamer.id.id.toString())); // Only attempt to create streamers for tokens that don't already have a streamer instance


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
      
      const client = await TwitchClient.createStreamer(auth, false);
      global.twitch.streamers.set(client.IAM.id, client);
      await streamerInit(client);
    }
  }
}
