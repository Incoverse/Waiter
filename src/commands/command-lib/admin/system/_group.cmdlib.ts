import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin system
 */
export default class AdminSystemGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "system";
    public description: string = "Commands to manage the system";
    
}