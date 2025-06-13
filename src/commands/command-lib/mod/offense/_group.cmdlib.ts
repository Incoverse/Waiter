import { DrBotSubcommandGroup } from "@src/lib/base/DrBotSubcommandGroup.js";
import Mod from "@src/commands/mod.cmd.js";
import { Client } from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";

declare const global: DrBotGlobal

/**
 * /mod group
 */
export default class ModOffenseGroup extends DrBotSubcommandGroup {
    static parent = Mod

    public name: string = "offense";
    public description: string = "Commands to manage offenses";

    public setup(client: Client): boolean {
        return !!global.app.config.appealSystem.website;
    }

}