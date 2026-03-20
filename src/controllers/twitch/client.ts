import CacheManager from "@/lib/cache";
import Communication from "@/lib/communication";
import { EncryptedField } from "@/lib/enc-field";
import { EnvironmentManager } from "@/lib/envmgr";
import axios, { type AxiosInstance } from "axios";
import { CronJob, CronTime } from "cron";
import prettyMilliseconds from "pretty-ms";
import { WebSocket } from "ws";
import { registerRoute } from "../web";
import { generateAuthURL } from "./authentication";
import { TwitchAuthDBSchema, type TwitchAuthDB, type TwitchUser } from "./typecheck";


import { schedule } from "@/lib/misc";
import EventEmitter from "events";
import { RecordId } from "surrealdb";

import * as Ads from "./funcs/channel/ads";
import * as Channel from "./funcs/channel/channel";
import * as Chat from "./funcs/channel/chat";
import * as Moderator from "./funcs/channel/mod";
import * as VIP from "./funcs/channel/vip";

import * as User from "./funcs/user";

import type { CoercedNumber, EventCondition, EventVersion, UserResolvable, ValidTopics } from "./types";

let eventSubConnURL = "wss://eventsub.wss.twitch.tv/ws";
export const comm: Communication = new Communication();

export const redirectURI = `${EnvironmentManager.get("PUBLIC_URL")}/twitch/auth`;

type TopicWithBroadcasterCondition = {
  [T in ValidTopics]: EventCondition<T> extends { broadcaster_user_id: string } ? T : never
}[ValidTopics];


export const ResDataData0 = (res: any) => res?.data?.data?.[0]
export const ResDataData = (res: any) => res?.data?.data
export const ResData = (res: any) => res?.data

export const DataFilter = (filter: (item: any) => boolean, res: any) => ResDataData(res).filter(filter)

export function paginateData<T>(
  api: AxiosInstance,
  url: string,
  params: Record<string, string | number>,
  { all = false, first = 100 }: { all?: boolean; first?: number } = {},
) {
  return async (res: any): Promise<T[]> => {
    let data = Array.isArray(res?.data?.data) ? res.data.data : [];

    if (!all) return data;

    let cursor = res?.data?.pagination?.cursor;
    while (cursor) {
      const nextRes = await api.get(url, {
        params: {
          ...params,
          after: cursor,
          first,
        },
      });

      data = data.concat(Array.isArray(nextRes?.data?.data) ? nextRes.data.data : []);
      cursor = nextRes?.data?.pagination?.cursor;
    }

    return data;
  };
}

export default class TwitchClient {
  public api: AxiosInstance;
  public isBot: boolean = false;
  public cache: CacheManager = new CacheManager(new Map());

  private auth: TwitchAuthDB;

  private tokenRefresher: CronJob;
  private logger: Console;

  private eventsubWS: WebSocket;
  private ESKATimeout: number;
  private ESKATimer: NodeJS.Timeout;
  private lastEventMessage: Date;
  private esID: string;
  private eventsubConnected = false;
  private connectEventSub: boolean = true;
  private eventSubData: {
    id: string, 
    type: ValidTopics;
    version: EventVersion<ValidTopics>;
    condition: EventCondition<ValidTopics>;
  }[] = [];
  public events: EventEmitter = new EventEmitter();

  public registeredEventsHash: string[] = [];

  public IAM: {
    id: string;
    login: string;
    display_name: string;
  }

  @schedule("*/5 * * * *")
  public static cleanOldCodes() {
    return global.db.query("DELETE twitch_auth_codes WHERE expires_at < time::now();");
  }

  public static async getUserInfo(accessToken: string): Promise<TwitchUser> {
    return await axios.get(`https://api.twitch.tv/helix/users`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': EnvironmentManager.get("TWITCH_CLIENT_ID")
      }
    }).then(ResDataData0);
  }
  
  public static async generateCode(expiresIn: string) {
    let code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();

    let codeExists = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);

    while (codeExists) {
      code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();
      codeExists = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);
    }
    
    await global.db.query("INSERT INTO twitch_auth_codes (code, expires_at) VALUES ($code, time::now() + <duration>$expiresIn)", { code, expiresIn });  

    return code;
  }

  private constructor(auth: TwitchAuthDB, connectToEventSub = true, bot = false) {
    this.isBot = bot
    this.logger = console.withSender("TWCL").withPrefix(
      bot ? "[BOT]" : "[CLIENT]",
    );
    this.auth = auth;
    this.api = axios.create({
      baseURL: "https://api.twitch.tv/helix",
      timeout: 10000,
    });

    this.connectEventSub = connectToEventSub;


    this.api.interceptors.request.use(
      (config) => {
        if (this.auth.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.auth.accessToken}`;
        }
        if (this.auth.clientId) {
          config.headers['Client-Id'] = this.auth.clientId;
        }

        this.logger.debug(` --> ${config.method.toUpperCase()} ${config.url}`);

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        this.logger.debug(` <-- ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          this.logger.warn(` <-- ${error.response.status} ${error.config.url} | ${error.response.data?.message || error.message}`);
        } else {
          this.logger.error(` <-- ERROR ${error.config ? error.config.url : ""}`, error);
        }
        return Promise.reject(error);
      }
    ); 
  }

  private async initialize() {
    this.logger.debug("Validating Access Token...");
    let expiresIn = await this.validateToken();
    if (!expiresIn) {
      this.logger.debug("Access Token is invalid. Refreshing...");
      expiresIn = await this.refreshToken();
    } else {
      this.logger.debug("Access Token is valid. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
    }

    if (expiresIn < 60) {
      this.logger.debug("Access Token is expiring soon. Refreshing...");
      expiresIn = await this.refreshToken();
      this.logger.debug("Access Token refreshed. Expires in: " + expiresIn + ` seconds (${prettyMilliseconds(expiresIn*1000)})`);
    }

    await this.setupRefresher((!expiresIn || expiresIn < 60) ? 0 : expiresIn);
    this.logger.info("Token Refresher initialized");


    this.logger.log("Fetching information about the authenticated user...");
    this.IAM = await this.fetchUser();

    this.logger = this.logger.withPrefix(`[${this.IAM.login}]`);


    if (this.connectEventSub) {
      this.logger.warn("Connecting to Twitch...");
      this.connect()
    }
    
    this.logger.success(`Twitch Client initialized as ${this.IAM.display_name} (${this.IAM.login})`);
  }
  
  

  public static async createBot(connectToEventSub = true, waitForInit = true): Promise<TwitchClient> {
    const auth = await this.loadAndReturnBotAuth().catch((err) => {
      throw err;
    });

    const cli = new TwitchClient(auth, connectToEventSub, true);
    if (waitForInit) {
      await cli.initialize()
      await cli.awaitConnection();
    }
    else cli.initialize();
    return cli;
  }

  public static async createStreamer(auth: TwitchAuthDB, connectToEventSub = true, waitForInit = true): Promise<TwitchClient> {
    const cli = new TwitchClient(auth, connectToEventSub, false);
    if (waitForInit) {
      await cli.initialize()
      await cli.awaitConnection();
    }
    else cli.initialize();
    return cli;
  }

  public async connect() {
    if (this.eventsubWS?.readyState !== WebSocket.OPEN && this.connectEventSub) {
      this.logger.debug("Initiating connection to Twitch EventSub...");
      this.eventsubWS = new WebSocket(eventSubConnURL);

      this.eventsubWS.onopen = () => {
        this.logger.success("Successfully connected to Twitch EventSub");
        this.eventsubConnected = true;
      }

      this.eventsubWS.onmessage = (event) => {
        this.lastEventMessage = new Date();
        const jsonified = JSON.parse(event.data.toString());

        const msgType = jsonified.metadata.message_type

        if (msgType === "session_welcome") {
          this.events.emit("welcomed", this, jsonified.payload);
          this.esID = jsonified.payload.session.id
          this.ESKATimeout = jsonified.payload.session.keepalive_timeout_seconds * 1000;
          if (this.ESKATimer) {
            clearInterval(this.ESKATimer);
          }

          this.ESKATimer = setInterval(() => {
            if (new Date().getTime() - this.lastEventMessage.getTime() > (this.ESKATimeout + 4000)) {
            this.logger.warn("No keep-alive message received. Reconnecting...");
            clearInterval(this.ESKATimer);
            this.eventsubWS.close(3177, "No keep-alive message received");
            }
          }, 500);


          this.eventSubData.forEach((evt) => {
            this.logger.warn(`Re-subscribing to ${evt.type}...`);
            this.listen(evt.type, evt.version, evt.condition, true);
          })
        } else if (msgType === "notification") {
          this.events.emit(jsonified.metadata.subscription_type, this, jsonified.payload);
        } else if (msgType === "session_keepalive") {
          // this.logger.log("Received keep-alive message", "debug");
        } else if (msgType === "revocation") {
          this.logger.warn("A revocation message was received regarding event type: " + jsonified.metadata.subscription_type);
        } else if (msgType === "session_reconnect") {
          this.logger.warn("Server requested a reconnect");
          let originalURL = eventSubConnURL;
          eventSubConnURL = jsonified.payload.session.reconnect_url || eventSubConnURL;
          const old = this.eventsubWS;

          this.eventsubWS = null
          this.eventsubConnected = false;
          this.connect();
          this.events.once("welcomed", (client, data) => {
            old.removeAllListeners();
            old.close(1000, "Reconnecting");
            eventSubConnURL = originalURL;
            this.logger.success("Reconnect complete");
          })

        } else {
          this.logger.warn(`Received unknown message type from EventSub: ${msgType}`);
        }
      }

      this.eventsubWS.onclose = (c) => {
        this.logger.error(`Disconnected from Twitch EventSub - (${c.code}) ${c.reason}`);
        this.eventsubConnected = false;
        this.eventsubWS.removeAllListeners();
        
        if (this.connectEventSub) {
          this.logger.warn("Attempting to reconnect to Twitch EventSub...");
          this.connect();
        }
      }

      this.eventsubWS.onerror = (err) => {
        this.logger.error(`Error connecting to Twitch EventSub: ${err}`);
        console.error(err);
      }
    }
  }

  public async awaitConnection() {
    if ((this.eventsubConnected || !this.connectEventSub)) {
      return true;
    }
    return new Promise<void>((resolve, reject) => {
      const interval = setInterval(() => {
        if ((this.eventsubConnected || !this.connectEventSub)) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }


  public async listen<Topic extends ValidTopics>(
    topic: Topic,
    v: EventVersion<Topic> | CoercedNumber<EventVersion<Topic>> = 1 as CoercedNumber<EventVersion<Topic>>,
    conditions: EventCondition<Topic> = {} as EventCondition<Topic>,
    noSave = false,
  ) {
    if (!this.eventsubConnected) {
      throw new Error('Not connected to Twitch EventSub');
    }

    if (!noSave)
    this.logger.warn(`Registering '${topic}' EventSub subscription...`);

    return await this.api.post(`/eventsub/subscriptions`, {
      type: topic,
      version: v.toString(),
      condition: conditions,
      transport: {
        method: 'websocket',
        session_id: this.esID
      }
    }).then((res) => {
      const jsonified = res.data instanceof Object || res.data instanceof Array ? res.data : JSON.parse(res.data);
      if (!noSave) {
        this.eventSubData.push({
          id: jsonified.data[0].id,
          type: topic,
          version: v.toString() as EventVersion<Topic>,
          condition: conditions as EventCondition<Topic>
        })
      }
    })
  }


  public async unlisten(id: string) {
    if (!this.eventsubConnected) {
      throw new Error('Not connected to Twitch EventSub');
    }

    return await this.api.delete(`/eventsub/subscriptions?id=${id}`).then(() => true).catch(() => false);
  }

  public async cleanup() {
    if (this.eventsubWS && this.eventsubConnected) {
      if (this.eventSubData.length > 0) {
        this.eventSubData.forEach((data) => {
          this.unlisten(data.id);
        })
      }

      this.eventsubWS.removeAllListeners();
      clearInterval(this.ESKATimer);
      this.connectEventSub = false;
      this.eventsubWS.close();
    }
  }



  private async setupRefresher(expiresIn: number) {
    if (this.tokenRefresher) {
      this.tokenRefresher.stop();
    }
    this.tokenRefresher = new CronJob(expiresIn >= 60 ? new Date(Date.now() + (expiresIn*1000) - 30000) : new Date(Date.now() + 300000), async () => {
      this.logger.warn("Refreshing Access Token...");
      const newExpires = await this.refreshToken();
      this.logger.success("Access Token refreshed. Expires in: " + newExpires + ` seconds (${prettyMilliseconds(newExpires*1000)})`);
      
      this.tokenRefresher.setTime(new CronTime(new Date(Date.now() + (newExpires*1000) - 30000)));
      this.tokenRefresher.start();
    }) 

    if (!expiresIn) {
      await this.tokenRefresher.fireOnTick();            
    } else {
      this.tokenRefresher.start();
    }

    return this.tokenRefresher;
  }

  private async refreshToken() {
    return await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${this.auth.clientId}&client_secret=${this.auth.clientSecret}&grant_type=refresh_token&refresh_token=${this.auth.refreshToken}`)
      .then(async (res) => {
        this.auth.accessToken = res.data.access_token;
        this.auth.refreshToken = res.data.refresh_token;
        this.auth.expires = new Date(Date.now() + res.data.expires_in * 1000);

        const encryptedAuth = new EncryptedField(this.auth);

        if (this.isBot) { 
          await global.db.query(
            "UPSERT waiter_data:root MERGE { twitch_auth: $encryptedAuth }",
            {
              encryptedAuth: encryptedAuth.toDB(),
            },
          );
        } else {
          if (!this.IAM?.id) {
            this.IAM = await this.fetchUser();
          }
          await global.db.query(
            "UPDATE streamer_tokens SET auth = $encryptedAuth WHERE streamer.id = $streamerId",
            {
              encryptedAuth: encryptedAuth.toDB(),
              streamerId: new RecordId("twitch_users", this?.IAM?.id),
            },
          );
        }
        this.logger.great("Twitch auth credentials refreshed and updated in database.");
        
        return res.data.expires_in;
      })
      .catch((err) => {
        console.error(err);
      });
  }

  private async validateToken() {
    if (!this.auth.accessToken) return 0

    return await axios.get(`https://id.twitch.tv/oauth2/validate`, {
      headers: {
        'Authorization': `OAuth ${this.auth.accessToken}`
      }
    }).then((res) => {
      return res.data.expires_in || 0;
    }).catch(()=>{
      return 0;
    })
  }

  private static async loadAndReturnBotAuth(): Promise<TwitchAuthDB> {
    const result = await global.db
      .query("SELECT twitch_auth FROM ONLY waiter_data:root")
      .collect<
      [
        {
          twitch_auth: string;
        },
      ]
      >();

    const encryptedAuth = EncryptedField.fromDB<TwitchAuthDB>(result[0]?.twitch_auth ?? null);

    let auth: TwitchAuthDB;

    if (encryptedAuth.isSet()) {
      try {
        const unvalidatedAuth = encryptedAuth.get();
        console.withSender("TWCL").log("Twitch auth found in database. Validating...");
        const parsedAuth = TwitchAuthDBSchema.safeParse(unvalidatedAuth);
        if (!parsedAuth.success)
          throw new Error(parsedAuth.error.message);
        auth = parsedAuth.data;
      } catch (error) {
        console.withSender("TWCL").error("Error parsing stored Twitch auth:", error);
        console.withSender("TWCL").debug("Clearing invalid Twitch auth from database.");
        await global.db.query('UPSERT waiter_data:root PATCH { "op": "remove", "path": "twitch_auth" }');
      }

      console.withSender("TWCL").great("Twitch auth loaded from database.");
    }

    if (!auth) {
      const CID = EnvironmentManager.get("TWITCH_CLIENT_ID");
      const CS = EnvironmentManager.get("TWITCH_CLIENT_SECRET");
      if (!CID || !CS) {
        throw new Error(
          "Missing Twitch Client ID or Client Secret in environment variables. Please set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.",
        );
      }

      auth = {
        clientId: CID,
        clientSecret: CS,
        accessToken: null,
        refreshToken: null,
        expires: null,
      };

      const authURL = generateAuthURL(CID, redirectURI, Buffer.from("HEAD_WAITER_BOT").toString("base64"));

      console.withSender("TWCL").info("Please authenticate as the Waiter Twitch bot at this url:")
      console.withSender("TWCL").info(authURL);

      console.withSender("TWCL").log("Waiting for authentication... (This will time out after 5 minutes)")
      const creds = await comm.waitFor(`auth-HEAD_WAITER_BOT`, 300000); // Wait for 5 minutes

      if (!creds) {
        throw new Error(
          "Authentication timed out. Please authenticate within 5 minutes of starting Waiter.",
        );
      }

      console.withSender("TWCL").great(
        "Received Twitch auth credentials from web interface."
      );

      auth = { ...auth, ...creds[0] };

      const encryptedAuth = new EncryptedField(auth);

      await global.db.query(
        "UPSERT waiter_data:root MERGE { twitch_auth: $encryptedAuth }",
        {
          encryptedAuth: encryptedAuth.toDB(),
        },
      );
      console.withSender("TWCL").great("Twitch auth credentials saved to database.");
    }

    return auth;
  }
  


  @registerRoute("GET", "/twitch/auth")
  private static async handleAuthRoute(req, res) {
    let state = req.query.state;

    if (state) {
      state = Buffer.from(decodeURIComponent(state), "base64").toString("utf-8");
    }
    const code = req.query.code;


    if (!code || !state) {
      res.status(400).json({ error: "Missing code or state in query parameters." });
      return;
    }

    if (state == "HEAD_WAITER_BOT") {
      const resp = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${EnvironmentManager.get("TWITCH_CLIENT_ID")}&client_secret=${EnvironmentManager.get("TWITCH_CLIENT_SECRET")}&code=${code}&grant_type=authorization_code&redirect_uri=${redirectURI}`)

      res.send("Authentication successful. You can close this page.");
      comm.emit(`auth-HEAD_WAITER_BOT`, {
        accessToken: resp.data.access_token,
        refreshToken: resp.data.refresh_token,
        expires: new Date(Date.now() + resp.data.expires_in * 1000),
      });
    } else {
      // TODO: Handle streamer authentication through web interface

      const authCode = state;

      const storedCode = await global.db.query("SELECT * FROM twitch_auth_codes WHERE code = $code", { code: authCode }).collect().then(res => (res[0] as any[])[0]);
    
      if (!storedCode) {
        res.status(400).json({ error: "Invalid or expired Waiter Twitch authentication code." });
        return;
      }

      // Delete the code from the database to prevent reuse
      await global.db.query("DELETE FROM twitch_auth_codes WHERE code = $code", { code: authCode });
      // await TwitchClient.generateCode("15m"); // Generate a new code immediately to replace the one that was just used, ensuring there's always a valid code available for the web interface to display.
      const resp = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${EnvironmentManager.get("TWITCH_CLIENT_ID")}&client_secret=${EnvironmentManager.get("TWITCH_CLIENT_SECRET")}&code=${code}&grant_type=authorization_code&redirect_uri=${redirectURI}`)


      const data = {
        accessToken: resp.data.access_token,
        refreshToken: resp.data.refresh_token,
        expires: new Date(Date.now() + resp.data.expires_in * 1000),
      };

      comm.emit("new-streamer-auth", data);
      comm.emit(`auth-${authCode}`, data);


      return res.send("Authentication successful. You can close this page.");


    }
  }

  private bindChannelFn<T extends (...args: any[]) => any>(fn: T): T {
    return fn.bind(this) as T;
  }

  public sendWhisper = this.bindChannelFn(User.sendWhisper)


  public fetchUser = (idLogin?: string): Promise<TwitchUser> => this.api.get(`/users${idLogin ? `?${/^\d+$/.test(idLogin) ? "id":"login"}=${idLogin}` : ""}`).then(ResDataData0).catch(()=>null)
  public getSubscriptions = () => this.api.get(`/eventsub/subscriptions`).then(ResData).catch(()=>null)

  public withChannel = (channelId: string | TwitchClient) => new ChannelSpecificWrapper(this, channelId);
  public resolveUserId = async (user: UserResolvable): Promise<string | null> => {
    if (typeof user === "string") {
      if (/^\d+$/.test(user)) {
        return user; // It's already a user ID
      } else {
        const fetched = await this.fetchUser(user);
        return fetched?.id || null;
      }
    }
    if ("id" in user) {
      return user.id;
    }
    const nameOrLogin = "login" in user ? user.login : user.name;
    const fetched = await this.fetchUser(nameOrLogin);
    return fetched?.id || null;
  };
}
export class ChannelSpecificWrapper {

  public channelId: string;

  public twcl: TwitchClient;

  constructor(twcl: TwitchClient, channelId: string | TwitchClient) {
    this.twcl = twcl;
    this.channelId = typeof channelId === "string" ? channelId : channelId.IAM.id;
  }


  private bindChannelFn<T extends (...args: any[]) => any>(fn: T): T {
    return fn.bind(this) as T;
  }

  public addVIP = this.bindChannelFn(VIP.add)
  public removeVIP = this.bindChannelFn(VIP.remove)
  public isVIP = this.bindChannelFn(VIP.is)

  public addMod = this.bindChannelFn(Moderator.add)
  public removeMod = this.bindChannelFn(Moderator.remove)
  public isMod = async (id = this.twcl.IAM.id, forceRefresh = false): Promise<boolean> => {
    if (this.isBroadcaster(id)) return true;
    return await Moderator.is.apply(this, [id, forceRefresh]);
  }
  public isBroadcaster = (id = this.twcl.IAM.id) => this.channelId === id
  public hasModRights = async (id = this.twcl.IAM.id) => this.isBroadcaster(id) || await this.isMod(id);

  public sendMessage = this.bindChannelFn(Chat.send)
  public deleteMessage = this.bindChannelFn(Chat.remove)
  public clearChat = this.bindChannelFn(Chat.clear)
  public setChatDelay = this.bindChannelFn(Chat.delay)
  public setEmoteOnly = this.bindChannelFn(Chat.emoteOnly)
  public setFollowersOnly = this.bindChannelFn(Chat.followersOnly)
  public setSubscribersOnly = this.bindChannelFn(Chat.subOnly)
  public setSlowMode = this.bindChannelFn(Chat.slowMode)
  public setUniqueMode = this.bindChannelFn(Chat.uniqueMode)
  public getChatSettings = this.bindChannelFn(Chat.getSettings)
  public getChatters = this.bindChannelFn(Chat.getChatters)
  public shoutout = this.bindChannelFn(Chat.shoutout)

  public snoozeAd = this.bindChannelFn(Ads.snooze)
  public getAdSchedule = this.bindChannelFn(Ads.getSchedule)

  public getChannelInfo = this.bindChannelFn(Channel.get)
  public modifyChannelInfo = this.bindChannelFn(Channel.modify)

  public listen<Topic extends TopicWithBroadcasterCondition>(
    topic: Topic,
    version: EventVersion<Topic> | CoercedNumber<EventVersion<Topic>> = 1 as CoercedNumber<EventVersion<Topic>>,
    conditions: Omit<EventCondition<Topic>, "broadcaster_user_id"> = {} as Omit<EventCondition<Topic>, "broadcaster_user_id">,
    noSave = false,
  ) {
    return this.twcl.listen(topic, version, {
      ...conditions,
      broadcaster_user_id: this.channelId
    } as EventCondition<Topic>, noSave);
  }
}
