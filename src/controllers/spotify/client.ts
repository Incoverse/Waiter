import type { AxiosInstance } from "axios";
import axios from "axios";
import chalk from "chalk";
import { registerRoute } from "../web";
import type { SpotifyAuthDB } from "./types";

const SPOTSender = chalk.hex("#1DB954").bold("SPOT");

const scopes = [
    "streaming",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-playback-position",
    "user-top-read",
    "user-read-recently-played",
    "user-library-modify",
    "user-library-read",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
]

export default class SpotifyClient {
    public api: AxiosInstance;
    private logger: Console;
    private auth: SpotifyAuthDB;
 
    
    constructor() {
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


  @registerRoute("GET", "/spotify/auth")
  private static async handleAuthRoute(req: Request, res: Response) {
    
  }
}