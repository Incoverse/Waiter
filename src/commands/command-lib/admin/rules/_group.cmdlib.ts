import Admin from "@src/commands/admin.cmd.js";
import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";

/**
 * /admin rules
 */
export default class AdminRulesGroup extends DrBotSubcommandGroup {
    static parent = Admin

    public name: string = "rules";
    public description: string = "Commands to manage the rules";
    
}