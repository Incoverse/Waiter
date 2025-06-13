import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";
import Mod from "@src/commands/mod.cmd.js";

/**
 * /mod stage
 */
export default class ModStageGroup extends DrBotSubcommandGroup {
    static parent = Mod

    public name: string = "stage";
    public description: string = "Commands to manage stage channels";

}