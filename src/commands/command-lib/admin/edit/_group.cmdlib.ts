import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin edit
 */
export default class AdminEditGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "edit";
    public description: string = "Commands to edit user's information in the database";
    
}