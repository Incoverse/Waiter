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

import * as Album from "./funcs/album";
import * as Artist from "./funcs/artist";
import * as Audiobook from "./funcs/audiobook";
import * as Category from "./funcs/category";
import * as Chapter from "./funcs/chapter";
import * as Episode from "./funcs/episode";
import * as Genre from "./funcs/genre";
import * as Library from "./funcs/library";
import * as Market from "./funcs/market";
import * as Player from "./funcs/player";
import * as Playlist from "./funcs/playlist";
import * as Search from "./funcs/search";
import * as Show from "./funcs/show";
import * as Track from "./funcs/track";
import * as User from "./funcs/user";


const SPOTSender = chalk.hex("#1DB954").bold("SPOT");
export default class SpotifyClient {
  public api: AxiosInstance;

  public logger: Console;
  private tokenRefresher: CronJob;
  
  private auth: SpotifyAuthDB;

  public waiterUserId: string;
  
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

  
  
  public static async create(auth: SpotifyAuthDB, wuId: string): Promise<SpotifyClient> {
    const client = new SpotifyClient(auth, wuId);
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
  
  private constructor(auth: SpotifyAuthDB, wuId: string) {
    this.auth = auth;
    this.waiterUserId = wuId;
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
        
        this.logger.debug(` --> ${config.method!.toUpperCase()} ${config.url}`);
        
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
          this.logger.warn(` <-- ${error.response.status} ${error.config.url} | ${error.response.data?.error?.message || error.message}`);
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
        this.logger.debug("Fetching information about the authenticated user...");
        this.IAM = await this.fetchUser();
        this.logger = this.logger.withPrefix(`[${this.IAM.display_name}]`);
      }
      
      this.logger.perf(`Spotify Client initialized as ${this.IAM.display_name} (ID: ${this.IAM.id})`);
      resolve();
    })
  }

  private async setupRefresher(expiresIn: number) {
    if (this.tokenRefresher) {
      this.tokenRefresher.stop();
    }
    const getNextRefreshTime = (tokenExpiresInSeconds: number) => new Date(Math.max(
      Date.now() + (tokenExpiresInSeconds * 1000) - 30000,
      Date.now() + 1000,
    ));

    this.tokenRefresher = new CronJob(expiresIn >= 60 ? getNextRefreshTime(expiresIn) : new Date(Date.now() + 300000), async () => {
      this.logger.warn("Refreshing Access Token...");
      const newExpires = await this.refreshToken();
      this.logger.success("Access Token refreshed. Expires in: " + newExpires + ` seconds (${prettyMilliseconds(newExpires*1000)})`);
      
      this.tokenRefresher.setTime(new CronTime(getNextRefreshTime(newExpires)));
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
        this.logger.error("Error refreshing access token:", err.response?.data?.error?.message || err.response?.data || err.message);
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
    const errorTemplate = findFiles(global.isCompiled ? "dist" : "src", /[\\/]spotify[\\/]templates[\\/]error\.html$/)?.shift();
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

      const successfulAuthTemplate = findFiles(global.isCompiled ? "dist" : "src", /[\\/]spotify[\\/]templates[\\/]successful_auth\.html$/)?.shift();
      return res.template(successfulAuthTemplate)

  }

  private bindChannelFn<T extends (this: any, ...args: any[]) => any>(fn: T): OmitThisParameter<T> {
    return fn.bind(this) as OmitThisParameter<T>;
  }



  //! -- Functions -- !//

  public get playback() {
    return {
      /** Fetches the current playback information */
      get: this.bindChannelFn(Player.get),
      /** Transfer playback to another device. If play is true, will also attempt to start playback on the new device. */
      transfer: this.bindChannelFn(Player.transfer),
      /** Fetches the user's available devices */
      getDevices: this.bindChannelFn(Player.getDevices),
      /** Get the currently playing track or episode. */
      getCurrentlyPlaying: this.bindChannelFn(Player.getCurrentlyPlaying),
      /** Starts playback of a context or a list of tracks */
      play: this.bindChannelFn(Player.play),
      /** Resumes playback */
      resume: this.bindChannelFn(Player.resume),
      /** Pauses playback */
      pause: this.bindChannelFn(Player.pause),
      /** Skips to the previous track */
      skipToPrevious: this.bindChannelFn(Player.skipToPrevious),
      /** Skips to the next track */
      skipToNext: this.bindChannelFn(Player.skipToNext),
      /** Seeks to a position in the currently playing track */
      seek: this.bindChannelFn(Player.seek),
      /** Sets the repeat mode for the current playback context */
      setRepeatMode: this.bindChannelFn(Player.setRepeatMode),
      /** Set volume for the current playback device. volumePercent must be between 0 and 100. */
      setVolume: this.bindChannelFn(Player.setVolume),
      /** Get volume for the current playback device. */
      getVolume: this.bindChannelFn(Player.getVolume),
      /** Toggles shuffle on or off for the current playback context */
      toggleShuffle: this.bindChannelFn(Player.toggleShuffle),
      /** Get the current user's recently played tracks. */
      getRecentlyPlayed: this.bindChannelFn(Player.getRecentlyPlayed),
      /** Get the user's queue */
      getQueue: this.bindChannelFn(Player.getQueue),
      /** Add a track or episode to the end of the user's queue */
      addToQueue: this.bindChannelFn(Player.addToQueue),
    }
  }

  public get user() {
    return {
      /** Get current user's (or specific user's) profile information */
      get: this.bindChannelFn(User.get),
      /** Get the current user's top artists or tracks. Time range can be specified to get top items over different periods. */
      getTopItems: this.bindChannelFn(User.getTopItems),
      /** Get the current user's followed artists. */
      getFollowedArtists: this.bindChannelFn(User.getFollowedArtists),
    }
  }

  public get album() {
    return {
      /** Get album information */
      get: this.bindChannelFn(Album.get),
      /** @deprecated Get Spotify catalog information for multiple albums identified by their Spotify IDs. */
      getSeveral: this.bindChannelFn(Album.getSeveral),
      /** Get Spotify catalog information about an album's tracks. */
      getTracks: this.bindChannelFn(Album.getTracks),
      /** Get a list of albums saved in the current Spotify user's library. */
      getSaved: this.bindChannelFn(Album.getSaved),
      /** @deprecated Save one or more albums to the current Spotify user's library. */
      saveForCurrentUser: this.bindChannelFn(Album.saveForCurrentUser),
      /** @deprecated Remove one or more albums from the current Spotify user's library. */
      removeForCurrentUser: this.bindChannelFn(Album.removeForCurrentUser),
      /** @deprecated Check if one or more albums are already saved in the current Spotify user's library. */
      checkSavedForCurrentUser: this.bindChannelFn(Album.checkSavedForCurrentUser),
      /** @deprecated Get featured new album releases from Spotify. */
      getNewReleases: this.bindChannelFn(Album.getNewReleases),
    }
  }

  public get artist() {
    return {
      /** Get Spotify catalog information for a single artist identified by their Spotify ID. */
      get: this.bindChannelFn(Artist.get),
      /** @deprecated Get Spotify catalog information for several artists based on their Spotify IDs. */
      getSeveral: this.bindChannelFn(Artist.getSeveral),
      /** Get Spotify catalog information about an artist's albums. */
      getAlbums: this.bindChannelFn(Artist.getAlbums),
      /** @deprecated Get Spotify catalog information about an artist's top tracks. */
      getTopTracks: this.bindChannelFn(Artist.getTopTracks),
      /** @deprecated Get Spotify catalog information about artists similar to a given artist. */
      getRelatedArtists: this.bindChannelFn(Artist.getRelatedArtists),
    }
  }

  public get audiobook() {
    return {
      /** Get Spotify catalog information for a single audiobook. */
      get: this.bindChannelFn(Audiobook.get),
      /** @deprecated Get Spotify catalog information for several audiobooks identified by their Spotify IDs. */
      getSeveral: this.bindChannelFn(Audiobook.getSeveral),
      /** Get Spotify catalog information about an audiobook's chapters. */
      getChapters: this.bindChannelFn(Audiobook.getChapters),
      /** Get a list of audiobooks saved in the current Spotify user's library. */
      getSaved: this.bindChannelFn(Audiobook.getSaved),
      /** @deprecated Save one or more audiobooks to the current Spotify user's library. */
      saveForCurrentUser: this.bindChannelFn(Audiobook.saveForCurrentUser),
      /** @deprecated Remove one or more audiobooks from the current Spotify user's library. */
      removeForCurrentUser: this.bindChannelFn(Audiobook.removeForCurrentUser),
      /** @deprecated Check if one or more audiobooks are already saved in the current Spotify user's library. */
      checkSavedForCurrentUser: this.bindChannelFn(Audiobook.checkSavedForCurrentUser),
    }
  }

  public get category() {
    return {
      /** @deprecated Get a list of categories used to tag items in Spotify. */
      getSeveral: this.bindChannelFn(Category.getSeveral),
      /** @deprecated Get a single category used to tag items in Spotify. */
      get: this.bindChannelFn(Category.get),
    }
  }

  public get chapter() {
    return {
      /** Get Spotify catalog information for a single audiobook chapter. */
      get: this.bindChannelFn(Chapter.get),
      /** @deprecated Get Spotify catalog information for several audiobook chapters identified by their Spotify IDs. */
      getSeveral: this.bindChannelFn(Chapter.getSeveral),
    }
  }

  public get episode() {
    return {
      /** Get Spotify catalog information for a single episode identified by its Spotify ID. */
      get: this.bindChannelFn(Episode.get),
      /** @deprecated Get Spotify catalog information for several episodes based on their Spotify IDs. */
      getSeveral: this.bindChannelFn(Episode.getSeveral),
      /** Get a list of episodes saved in the current Spotify user's library. */
      getSaved: this.bindChannelFn(Episode.getSaved),
      /** @deprecated Save one or more episodes to the current user's library. */
      saveForCurrentUser: this.bindChannelFn(Episode.saveForCurrentUser),
      /** @deprecated Remove one or more episodes from the current user's library. */
      removeForCurrentUser: this.bindChannelFn(Episode.removeForCurrentUser),
      /** @deprecated Check if one or more episodes are already saved in the current user's library. */
      checkSavedForCurrentUser: this.bindChannelFn(Episode.checkSavedForCurrentUser),
    }
  }

  public get genre() {
    return {
      /** @deprecated Retrieve available genres that can be used as recommendation seeds. */
      getRecommendationSeeds: this.bindChannelFn(Genre.getRecommendationSeeds),
    }
  }

  public get library() {
    return {
      /** Save one or more items to the current user's library using Spotify URIs. */
      saveItems: this.bindChannelFn(Library.saveItems),
      /** Remove one or more items from the current user's library using Spotify URIs. */
      removeItems: this.bindChannelFn(Library.removeItems),
      /** Check if one or more items are saved in the current user's library using Spotify URIs. */
      containsItems: this.bindChannelFn(Library.containsItems),
    }
  }

  public get market() {
    return {
      /** @deprecated Get the list of markets where Spotify is available. */
      getAvailable: this.bindChannelFn(Market.getAvailable),
    }
  }

  public get playlist() {
    return {
      /** Get a playlist owned by a Spotify user. */
      get: this.bindChannelFn(Playlist.get),
      /** Change a playlist's details. */
      changeDetails: this.bindChannelFn(Playlist.changeDetails),
      /** @deprecated Deprecated endpoint alias for getItems(). */
      getTracks: this.bindChannelFn(Playlist.getTracks),
      /** @deprecated Deprecated endpoint alias for updateItems(). */
      updateTracks: this.bindChannelFn(Playlist.updateTracks),
      /** @deprecated Deprecated endpoint alias for addItems(). */
      addTracks: this.bindChannelFn(Playlist.addTracks),
      /** @deprecated Deprecated endpoint alias for removeItems(). */
      removeTracks: this.bindChannelFn(Playlist.removeTracks),
      /** Get full details of the items of a playlist. */
      getItems: this.bindChannelFn(Playlist.getItems),
      /** Update playlist items (replace or reorder). */
      updateItems: this.bindChannelFn(Playlist.updateItems),
      /** Add items to a playlist. */
      addItems: this.bindChannelFn(Playlist.addItems),
      /** Remove items from a playlist. */
      removeItems: this.bindChannelFn(Playlist.removeItems),
      /** Get current user's playlists. */
      getCurrentUserPlaylists: this.bindChannelFn(Playlist.getCurrentUserPlaylists),
      /** Create a playlist for the current user. */
      create: this.bindChannelFn(Playlist.create),
      /** @deprecated Get a list of the playlists owned or followed by a Spotify user. */
      getUserPlaylists: this.bindChannelFn(Playlist.getUserPlaylists),
      /** @deprecated Create a playlist for a specific Spotify user. */
      createForUser: this.bindChannelFn(Playlist.createForUser),
      /** @deprecated Get Spotify featured playlists. */
      getFeatured: this.bindChannelFn(Playlist.getFeatured),
      /** @deprecated Get playlists for a specific browse category. */
      getCategoryPlaylists: this.bindChannelFn(Playlist.getCategoryPlaylists),
      /** Get playlist cover images. */
      getCover: this.bindChannelFn(Playlist.getCover),
      /** Replace playlist cover image with base64 encoded JPEG data. */
      uploadCover: this.bindChannelFn(Playlist.uploadCover),
    }
  }

  public get search() {
    return {
      /** Search Spotify catalog for matching items. */
      query: this.bindChannelFn(Search.query),
    }
  }

  public get show() {
    return {
      /** Get Spotify catalog information for a single show identified by its Spotify ID. */
      get: this.bindChannelFn(Show.get),
      /** @deprecated Get Spotify catalog information for several shows based on their Spotify IDs. */
      getSeveral: this.bindChannelFn(Show.getSeveral),
      /** Get Spotify catalog information about a show's episodes. */
      getEpisodes: this.bindChannelFn(Show.getEpisodes),
      /** Get a list of shows saved in the current Spotify user's library. */
      getSaved: this.bindChannelFn(Show.getSaved),
      /** @deprecated Save one or more shows to the current Spotify user's library. */
      saveForCurrentUser: this.bindChannelFn(Show.saveForCurrentUser),
      /** @deprecated Remove one or more shows from the current Spotify user's library. */
      removeForCurrentUser: this.bindChannelFn(Show.removeForCurrentUser),
      /** @deprecated Check if one or more shows are already saved in the current Spotify user's library. */
      checkSavedForCurrentUser: this.bindChannelFn(Show.checkSavedForCurrentUser),
    }
  }

  public get track() {
    return {
      /** Get Spotify catalog information for a single track identified by its Spotify ID. */
      get: this.bindChannelFn(Track.get),
      /** @deprecated Get Spotify catalog information for several tracks based on their Spotify IDs. */
      getSeveral: this.bindChannelFn(Track.getSeveral),
      /** Get a list of tracks saved in the current Spotify user's library. */
      getSaved: this.bindChannelFn(Track.getSaved),
      /** @deprecated Save one or more tracks to the current user's library. */
      saveForCurrentUser: this.bindChannelFn(Track.saveForCurrentUser),
      /** @deprecated Remove one or more tracks from the current user's library. */
      removeForCurrentUser: this.bindChannelFn(Track.removeForCurrentUser),
      /** @deprecated Check if one or more tracks are already saved in the current user's library. */
      checkSavedForCurrentUser: this.bindChannelFn(Track.checkSavedForCurrentUser),
      /** @deprecated Get audio features for multiple tracks based on their Spotify IDs. */
      getSeveralAudioFeatures: this.bindChannelFn(Track.getSeveralAudioFeatures),
      /** @deprecated Get audio feature information for a single track identified by its Spotify ID. */
      getAudioFeatures: this.bindChannelFn(Track.getAudioFeatures),
      /** @deprecated Get low-level audio analysis for a single track identified by its Spotify ID. */
      getAudioAnalysis: this.bindChannelFn(Track.getAudioAnalysis),
      /** @deprecated Get recommendations based on seed artists, tracks, and genres. */
      getRecommendations: this.bindChannelFn(Track.getRecommendations),
    }
  }

  public get playable() {
    return {
      /**
       * Resolves a Spotify URI (spotify:type:id) and fetches the referenced object.
       *
       * Example: spotify:album:2up3OPMp9Tb4dAKM2erWXQ
       */
      get: async (id: string) => {
        const parts = id?.split(":");

        if (!parts || parts.length < 3 || parts[0] !== "spotify") {
          this.logger.warn("Invalid Spotify URI provided to playable.get():", id);
          return null;
        }

        const type = parts[1]!;
        const spotifyId = parts[2]!;

        switch (type) {
          case "album":
            return this.album.get(spotifyId);
          case "artist":
            return this.artist.get(spotifyId);
          case "audiobook":
            return this.audiobook.get(spotifyId);
          case "chapter":
            return this.chapter.get(spotifyId);
          case "episode":
            return this.episode.get(spotifyId);
          case "playlist":
            return this.playlist.get(spotifyId);
          case "show":
            return this.show.get(spotifyId);
          case "track":
            return this.track.get(spotifyId);
          default:
            this.logger.warn(`Unsupported Spotify URI type for playable.get(): ${type}`);
            return null;
        }
      }
    }
  }

}

