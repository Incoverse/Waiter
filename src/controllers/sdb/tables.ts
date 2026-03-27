import TableDefinition from "@/lib/base/tableDefinition";
import type { RecordId, SurrealTransaction } from "surrealdb";
import { registerMerger } from "./utils";

export default class SDBDefinitions extends TableDefinition {
  public static override priority = 0; // Always load first

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

  public static readonly USERS = `
        DEFINE TABLE OVERWRITE users SCHEMALESS;

        DEFINE FIELD OVERWRITE twitch ON users TYPE record<twitch_users> | null DEFAULT null;
        DEFINE FIELD OVERWRITE discord ON users TYPE record<discord_users> | null DEFAULT null;

        -- Only one user per twitch or discord account
        DEFINE INDEX OVERWRITE unique_twitch ON TABLE users FIELDS twitch UNIQUE;
        DEFINE INDEX OVERWRITE unique_discord ON TABLE users FIELDS discord UNIQUE;
    `.trim();

  public static readonly STREAMER_TOKENS = `
        DEFINE TABLE OVERWRITE streamer_tokens SCHEMALESS;

        DEFINE FIELD OVERWRITE streamer ON streamer_tokens TYPE record<users>;
        DEFINE FIELD OVERWRITE auth ON streamer_tokens TYPE string; -- Encrypted
        DEFINE FIELD OVERWRITE type ON streamer_tokens TYPE "twitch" | "spotify";

        -- Only one token per streamer per type
        DEFINE INDEX OVERWRITE unique_streamer_token ON TABLE streamer_tokens FIELDS streamer, type UNIQUE;
    `.trim();

  public static readonly WAITER_DATA = `
        DEFINE TABLE OVERWRITE waiter_data SCHEMALESS;
    `.trim();





  //? -- MERGERS --
  @registerMerger("streamer_tokens")
  private async mergeStreamerTokens(transaction: SurrealTransaction, fromUser: RecordId, toUser: RecordId) {
    const logger = console.withSender("MERGE").withPrefix(`[streamer_tokens]`);
    //! If there are tokens for fromUser, check if toUser already has tokens of the same type. If so, delete the fromUser tokens. If not, transfer the fromUser tokens to toUser by updating the streamer field to reference toUser instead of fromUser.
    
    const fromTokens = await global.db.query(
      `SELECT * FROM streamer_tokens WHERE streamer = $fromUser`,
      { fromUser },
    ).collect().then(a=>a[0]) as any[];
    const toTokens = await global.db.query(
      `SELECT * FROM streamer_tokens WHERE streamer = $toUser`,
      { toUser },
    ).collect().then(a=>a[0]) as any[];

    for (const fromToken of fromTokens) {
      const conflictingToToken = toTokens.find((t) => t.type === fromToken.type);
      if (conflictingToToken) {
        logger.debug(`Deleting token ${fromToken.id} for user ${fromUser} because of conflict with user ${toUser}`);
        await transaction.delete(fromToken.id);
      } else {
        logger.debug(`Transferring token ${fromToken.id} from user ${fromUser} to user ${toUser}`);
        await transaction.update(fromToken.id).merge({ streamer: toUser });
      }
    }
  }

  @registerMerger("users")
  private async mergeUsers(transaction: SurrealTransaction, fromUser: RecordId, toUser: RecordId) {
    // Get contents of fromUser, and apply everything to toUser that is not set in toUser. Then delete fromUser.
    const fromUserData = await global.db.query(
      `SELECT * FROM $fromUser`,
      { fromUser },
    ).collect().then(a=>a[0][0]) as any;
    const toUserData = await global.db.query(
      `SELECT * FROM $toUser`,
      { toUser },
    ).collect().then(a=>a[0][0]) as any;  

  
    await transaction.delete(fromUser);
    await transaction.update(toUser).merge({
      twitch: toUserData.twitch ?? fromUserData.twitch ?? null,
      discord: toUserData.discord ?? fromUserData.discord ?? null,
    });
  }
}

