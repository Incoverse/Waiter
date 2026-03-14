declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * @description JWT token for SurrealDB authentication
     */
    SURREAL_JWT: string;
    /**
     * @description Active database for SurrealDB
     */
    ACTIVE_DB: string;

    TWITCH_CLIENT_ID: string;
    TWITCH_CLIENT_SECRET: string;
    TWITCH_ACCESS_TOKEN: string;
    TWITCH_REFRESH_TOKEN: string;

    TWITCH_EXPIRES_ISO: string;

    DISCORD_TOKEN: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_GUILD_ID?: string;
  }
}
