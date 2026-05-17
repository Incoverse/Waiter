import TableDefinition from "@/lib/base/tableDefinition";

export default class DiscordDefinitions extends TableDefinition {
  public static override priority = 1;

  public static readonly WAITER_DATA_EXTENSION = `
    DEFINE FIELD OVERWRITE discord_auth ON waiter_data TYPE string | NONE DEFAULT NONE; -- Encrypted;
  `.trim();

  public static readonly DISCORD_USERS = `
    DEFINE TABLE OVERWRITE discord_users SCHEMALESS;

    DEFINE FIELD OVERWRITE username ON discord_users TYPE string;
    DEFINE FIELD OVERWRITE display_name ON discord_users TYPE string;
  `.trim();

  public static readonly USERS_ADDON_DISCORD = `
    DEFINE FIELD OVERWRITE discord ON users TYPE record<discord_users> | null DEFAULT null;
    DEFINE INDEX OVERWRITE unique_discord ON TABLE users FIELDS discord UNIQUE;
  `.trim();
}
