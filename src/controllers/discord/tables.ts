import TableDefinition from "@/lib/base/tableDefinition";

export default class DiscordDefinitions extends TableDefinition {
  public static override priority = 1; // Always load first

  public static readonly WAITER_DATA_EXTENSION = `
        DEFINE FIELD OVERWRITE discord_auth ON waiter_data TYPE string;
    `.trim();
}
