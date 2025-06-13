import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin drbot
 */
export default class AdminDrBotGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "drbot";
    public description: string = "Commands to manage DrBot";
    
}