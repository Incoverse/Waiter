import { EncryptedField } from "@/lib/enc-field";
import { findFiles, schedule } from "@/lib/misc";
import type { AxiosInstance } from "axios";
import axios from "axios";
import chalk from "chalk";
import { CronJob, CronTime } from "cron";
import type { Request, Response } from "express";
import prettyMilliseconds from "pretty-ms";
import { RecordId } from "surrealdb";
import { registerRoute } from "../web";
import { getRedirectURI } from "./lib/authentication";
import type { SpotifyAuthDB } from "./types";

const SPOTSender = chalk.hex("#1DB954").bold("SPOT");
export default class SpotifyClient {
  public api: AxiosInstance;

  private logger: Console;
  private tokenRefresher: CronJob;
  
  private auth: SpotifyAuthDB;

  public IAM: {
    id: string;
    display_name: string;
    product: "premium" | string; // "premium" if the user has Spotify Premium
    country: string; // SE
  }

  @schedule("*/5 * * * *")
  public static cleanOldCodes() {
    return global.db.query("DELETE spotify_auth_codes WHERE expires_at < time::now();");
  }

  
  
  public static async create(auth: SpotifyAuthDB): Promise<SpotifyClient> {
    const client = new SpotifyClient(auth);
    client.auth = auth;
    await client.initialize();
    return client;
  }
  
  public static async getUserInfo(accessToken: string) {
    try {
      const response = await axios.get("https://api.spotify.com/v1/me", {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      });
      return response.data;
    } catch (error) {
      console.withSender(SPOTSender).error("Error fetching user info:", error);
      return null;
    }
  }
  
  private constructor(auth: SpotifyAuthDB) {
    this.auth = auth;
    this.logger = console.withSender(SPOTSender).withPrefix(
      "[CLIENT]",
    );
    this.api = axios.create({
      baseURL: "https://api.spotify.com/v1",
      timeout: 10000,
    });
    
    
    this.api.interceptors.request.use(
      (config) => {
        if (this.auth.accessToken) {
          config.headers['Authorization'] = `Bearer ${this.auth.accessToken}`;
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
  
  
  public static async generateCode(expiresIn: string) {
    let code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();
    
    let codeExists = await global.db.query("SELECT * FROM spotify_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);
    
    while (codeExists) {
      code = [...Array(12)].map(() => Math.random().toString(36)[2]).join("").toUpperCase();
      codeExists = await global.db.query("SELECT * FROM spotify_auth_codes WHERE code = $code", { code }).collect().then(res => (res[0] as any[]).length > 0);
    }
    
    await global.db.query("INSERT INTO spotify_auth_codes (code, expires_at) VALUES ($code, time::now() + <duration>$expiresIn)", { code, expiresIn });  
    
    return code;
  }
  
  private initialize() {
    return new Promise<void>(async (resolve, reject) => {
      this.logger.debug("Refreshing Access Token...");
      let expiresIn = await this.refreshToken();
      
      await this.setupRefresher((!expiresIn || expiresIn < 60) ? 0 : expiresIn);
      this.logger.info("Token Refresher initialized");
      
      if (!this.IAM) {
        this.logger.log("Fetching information about the authenticated user...");
        this.IAM = await this.fetchUser();
        this.logger = this.logger.withPrefix(`[${this.IAM.display_name}]`);
      }
      
      this.logger.success(`Spotify Client initialized as ${this.IAM.display_name} (ID: ${this.IAM.id})`);
      resolve();
    })
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
    return await axios.post(`https://accounts.spotify.com/api/token`, new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.auth.refreshToken,
    }), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${this.auth.clientId}:${this.auth.clientSecret}`).toString("base64")}`
      }
    })
      .then(async (res) => {
        this.auth.accessToken = res.data.access_token;
        this.auth.refreshToken = res.data.refresh_token || this.auth.refreshToken; // Spotify may not return a new refresh token, in which case we should keep using the old one
        this.auth.expires = new Date(Date.now() + res.data.expires_in * 1000);

        const encryptedAuth = new EncryptedField(this.auth);
        if (!this.IAM?.id) {
          this.IAM = await this.fetchUser();
          this.logger = this.logger.withPrefix(`[${this.IAM.display_name}]`);
        }

        const user = (await global.db.query(
          `SELECT id FROM users WHERE spotify = $spotifyId`,
          { spotifyId: new RecordId("spotify_users", this.IAM.id) },
        ).collect().then(res => (res[0] as any[])[0]) as {id: RecordId}).id;

        await global.db.query(
          "UPDATE streamer_tokens SET auth = $encryptedAuth WHERE streamer.id = $streamerId AND type = 'spotify'",
          {
            encryptedAuth: encryptedAuth.toDB(),
            streamerId: user,
          },
        );
        this.logger.great("Spotify auth credentials refreshed and updated in database.");
        
        return res.data.expires_in;
      })
      .catch((err) => {
        console.error(err);
      });
  }
    
  public async fetchUser() {
    try {
      const response = await this.api.get("/me");
      return response.data;
    } catch (error) {
      this.logger.error("Error fetching authenticated user info:", error);
      throw new Error("Failed to fetch authenticated user info. Please check the logs for more details.");
    }
  }
  
  public get hasPremium() {
    return this.IAM.product === "premium";
  }
  
  public async cleanup() {}

  // TODO: Move this out of client.ts and place it in index.ts (SpotifyController)
  @registerRoute("GET", () => global.config.spotify.authEndpoint)
  private static async handleAuthRoute(req: Request, res: Response) {
    const errorTemplate = findFiles(global.isCompiled ? "dist" : "src", /\/spotify\/templates\/error\.html$/)?.shift();
    let state = req.query.state?.toString();

    if (state) {
      state = Buffer.from(decodeURIComponent(state), "base64url").toString("utf-8");
    }
    const code = req.query.code?.toString();


    if (!code || !state) {
      res.status(400).template(errorTemplate, { title: "Authentication Error", message: "Missing required query parameters. Please ensure you are authenticating through the correct process." });
      return;
    }

      const authCode = state.split("-")[0];
      const userId = state.split("-").slice(1).join("-");

      const storedCode = await global.db.query("SELECT * FROM spotify_auth_codes WHERE code = $code", { code: authCode }).collect().then(res => (res[0] as any[])[0]);
    
      if (!storedCode) {
        return res.status(400).template(errorTemplate, { title: "Authentication Error", message: "Invalid or expired Waiter Spotify authentication code." });
      }


      // await TwitchClient.generateCode("15m"); // Generate a new code immediately to replace the one that was just used, ensuring there's always a valid code available for the web interface to display.
      const resp = await axios.post(`https://accounts.spotify.com/api/token`, new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getRedirectURI()
      }), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`
        }
      }).catch(err => {
        console.withSender(SPOTSender).error("Error exchanging code for tokens:", err.response?.data || err.message || err);
        throw new Error("Failed to exchange code for tokens. Please try again.");
      });


      const data = {
        accessToken: resp.data.access_token,
        refreshToken: resp.data.refresh_token,
        expires: new Date(Date.now() + resp.data.expires_in * 1000),
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
      };


      const userInfo = await SpotifyClient.getUserInfo(data.accessToken);

      if (!userInfo) {
        console.withSender(SPOTSender).error("Failed to fetch user info with the new access token. Response data:", resp.data);
        return res.status(500).template(errorTemplate, { title: "Authentication Error", message: "Failed to fetch user info from Spotify API. Please try again." });
      }

      console.withSender(SPOTSender).great(`Successfully authenticated Spotify user: ${userInfo.display_name} (ID: ${userInfo.id})`);

      await global.db.query(
        `UPSERT spotify_users:\`${userInfo.id}\` SET display_name = $display_name, has_premium = $hasPremium`,
        { display_name: userInfo.display_name, hasPremium: userInfo.product === "premium" }
      );


      const user = await global.db.query(
        `UPSERT ONLY users SET spotify = $spotifyId WHERE id = $userId RETURN id`,
        { spotifyId: new RecordId("spotify_users", userInfo.id), userId: new RecordId("users", userId) }
      ).collect().then(res => (res[0] as {id: RecordId}).id);

      const encryptedAuth = new EncryptedField({
        ...data,
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET
      });

      try {
        await global.db.query(
          `INSERT INTO streamer_tokens (streamer, type, auth) VALUES ($streamer, 'spotify', $encryptedAuth)`,
          {
            streamer: user,
            encryptedAuth: encryptedAuth.toDB()
          }
        );
      } catch (err) {
        if (err instanceof Error && /Database index.*already contains/.test(err.message)) {
          return res.template(errorTemplate, { 
            title: "Authentication Error",
            message: "This Spotify account has already been authenticated with Waiter. If you believe this is an error, please contact support."
          });
        } else {
          console.withSender(SPOTSender).error("Error inserting Spotify auth into database:", err);
          return res.template(errorTemplate, { 
            title: "Authentication Error",
            message: "An unexpected error occurred while saving your authentication. Please try again and contact support if the issue persists."
          });
        }
      }

      // Delete the code from the database to prevent reuse
      await global.db.query("DELETE FROM spotify_auth_codes WHERE code = $code", { code: authCode });

      const successfulAuthTemplate = findFiles(global.isCompiled ? "dist" : "src", /\/spotify\/templates\/successful_auth\.html$/)?.shift();
      return res.template(successfulAuthTemplate)

  }
}