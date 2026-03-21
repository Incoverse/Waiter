import TableDefinition from "@/lib/base/tableDefinition";

export default class TwitchDefinitions extends TableDefinition {
  public static override priority = 1; // Always load first

  public static readonly WAITER_DATA_EXTENSION = `
    DEFINE FIELD OVERWRITE twitch_auth ON waiter_data TYPE string; -- Encrypted
  `.trim();

  public static readonly TWITCH_AUTH_CODES = `
    DEFINE TABLE OVERWRITE twitch_auth_codes SCHEMALESS
      PERMISSIONS
        FOR select WHERE expires_at > time::now();
    DEFINE FIELD OVERWRITE code ON twitch_auth_codes TYPE string;
    DEFINE FIELD OVERWRITE expires_at ON twitch_auth_codes TYPE datetime;
  `.trim();
  



}
