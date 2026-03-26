import TableDefinition from "@/lib/base/tableDefinition";

export default class SDBDefinitions extends TableDefinition {
  public static override priority = 0; // Always load first

  public static readonly LINKED = `
        DEFINE TABLE OVERWRITE linked SCHEMALESS TYPE RELATION FROM discord_users|twitch_users TO discord_users|twitch_users;

        DEFINE FIELD OVERWRITE key ON linked VALUE <string>array::sort([in, out]);
        DEFINE INDEX OVERWRITE unique_link ON TABLE linked FIELDS key UNIQUE;
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
        DEFINE FIELD OVERWRITE auth ON streamer_tokens TYPE string; -- Encrypted
        DEFINE FIELD OVERWRITE type ON streamer_tokens TYPE "twitch" | "spotify";

        -- Only one token per streamer per type
        DEFINE INDEX OVERWRITE unique_streamer_token ON TABLE streamer_tokens FIELDS streamer, type UNIQUE;
    `.trim();

  public static readonly WAITER_DATA = `
        DEFINE TABLE OVERWRITE waiter_data SCHEMALESS;
    `.trim();
}
