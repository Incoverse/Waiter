export default class TableDefinition {
    public static readonly LINKED = `
        DEFINE TABLE OVERWRITE linked SCHEMALESS TYPE RELATION FROM discord_users|twitch_users TO discord_users|twitch_users;

        DEFINE FIELD OVERWRITE key ON linked VALUE <string>array::sort([in, out]);
        DEFINE INDEX unique_link ON TABLE linked FIELDS key UNIQUE;
    `.trim();

    public static readonly TWITCH_USERS = `
        DEFINE TABLE OVERWRITE twitch_users SCHEMALESS;

        DEFINE FIELD OVERWRITE login ON twitch_users TYPE string;
        DEFINE FIELD OVERWRITE display_name ON twitch_users TYPE string;
    `.trim();

    public static readonly DISCORD_USERS = `
        DEFINE TABLE OVERWRITE discord_users SCHEMALESS;

        DEFINE FIELD OVERWRITE username ON discord_users TYPE string;
        DEFINE FIELD OVERWRITE display_name ON discord_users TYPE string;
    `.trim();


    public static readonly STREAMER_TOKENS = `
        DEFINE TABLE OVERWRITE streamer_tokens SCHEMALESS;

        DEFINE FIELD OVERWRITE streamer ON streamer_tokens TYPE record<twitch_users>;
        DEFINE FIELD OVERWRITE access_token ON streamer_tokens TYPE string;
        DEFINE FIELD OVERWRITE refresh_token ON streamer_tokens TYPE string;
        DEFINE FIELD OVERWRITE expires_at ON streamer_tokens TYPE datetime;
        DEFINE FIELD OVERWRITE type ON streamer_tokens TYPE "twitch" | "spotify";
    `.trim();

}