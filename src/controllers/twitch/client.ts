import { EncryptedField } from "@/lib/enc-field";
import { type AxiosInstance } from "axios";

type TwitchAuth = {
  access_token: string;
  refresh_token: string;
  expires: Date;
};

export default class TwitchClient {
  private api: AxiosInstance;

  private auth: TwitchAuth;

  private constructor(api: AxiosInstance, auth: TwitchAuth) {
    this.auth = auth;
    this.api = api;
  }

  public static async create() {
    const result = await global.db
      .query("SELECT twitch_auth FROM ONLY waiter_data:root")
      .collect<
        [
          {
            twitch_auth: string;
          },
        ]
      >();

    const encryptedAuth = EncryptedField.fromDB(result[0]?.twitch_auth ?? null);

    console
      .sender("TWCL")
      .debug("Creating TwitchClient with auth:", encryptedAuth.toString());
  }
}
