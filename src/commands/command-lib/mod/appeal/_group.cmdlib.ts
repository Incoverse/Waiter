import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";
import Mod from "@src/commands/mod.cmd.js";

/**
 * /mod appeal
 */
export default class ModAppealGroup extends DrBotSubcommandGroup {
    static parent = Mod

    public name: string = "appeal";
    public description: string = "Commands to manage appeals";
}