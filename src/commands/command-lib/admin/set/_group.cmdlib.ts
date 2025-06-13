import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin set
 */
export default class AdminSetGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "set";
    public description: string = "Set specific configurations in DrBot";
    
}