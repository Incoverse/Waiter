import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin entry
 */
export default class AdminEntryGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "entry";
    public description: string = "Commands to edit user's information in the database";
    
}