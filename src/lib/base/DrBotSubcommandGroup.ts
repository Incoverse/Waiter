/*
  * Copyright (c) 2024 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import * as Discord from "discord.js";
import path from "path";
export type DrBotSlashCommand = Discord.SlashCommandBuilder | Discord.SlashCommandSubcommandsOnlyBuilder | Discord.SlashCommandOptionsOnlyBuilder | Omit<Discord.SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup"> | Omit<Discord.SlashCommandSubcommandsOnlyBuilder, "addSubcommand" | "addSubcommandGroup"> | Omit<Discord.SlashCommandOptionsOnlyBuilder, "addSubcommand" | "addSubcommandGroup">;
import crypto from "crypto";
import { readFileSync, existsSync, readdirSync } from "fs";
import { DrBotSubcommand } from "./DrBotSubcommand.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import CacheManager from "../utilities/cacheManager.js";
import { DrBotCommand } from "./DrBotCommand.js";

declare const global: DrBotGlobal;

export abstract class DrBotSubcommandGroup {

    // static parent: DrBotCommand; //! The parent's class. This is required for subcommands

    public abstract name: string;
    public abstract description: string;


    private group: Discord.SlashCommandSubcommandGroupBuilder  = null;
    private client: Discord.Client = null;

    private children: Map<string, DrBotSubcommand> = new Map();
    
    constructor(parentSlashCommand: Discord.SlashCommandBuilder, client: Discord.Client) {
        this.client = client;
    }

    public prep() {
        const setupResult = this.setup(this.client)

        if (!setupResult) {
            global.logger.debugWarn(`Subcommand group ${this.constructor.name} is not setup correctly. Skipping...`, this.constructor.name);
            return false;
        }   

        if (this.group == null) {
            this.group = new Discord.SlashCommandSubcommandGroupBuilder()
                .setName(this.name)
                .setDescription(this.description);
        }

        return true;
    }


    public setup(client: Discord.Client): boolean {
        return true;
    }

    public async addChild(subcommand: DrBotSubcommand): Promise<boolean> {
        if (this.group == null) {
            throw new Error("Subcommand group is not initialized");
        }

        const setupResult = await subcommand.setup((async (scf: any) => {
            const sc = await scf(new Discord.SlashCommandSubcommandBuilder());
            subcommand._cmdName = sc.name;
            this.group.addSubcommand(sc);
            return sc;
        }), this.client);

        if (!setupResult) {
            global.logger.debugWarn(`Subcommand ${subcommand.constructor.name} is not setup correctly. Skipping...`, subcommand.constructor.name);
            return setupResult;
        }
        this.children.set(subcommand._cmdName, subcommand);

        return true;
    }

    

    public getGroup(): Discord.SlashCommandSubcommandGroupBuilder {
        if (this.group == null) {
            throw new Error("Subcommand group is not initialized");
        }

        return this.group;
    }

    public getWithName(name: string): DrBotSubcommand | null {
        if (this.children.has(name)) {
            return this.children.get(name);
        }
        return null;
    }
}

