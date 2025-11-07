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
import { DrBotSubcommandGroup } from "./DrBotSubcommandGroup.js";

declare const global: DrBotGlobal;

export abstract class DrBotCommand {
    
    static defaultSetupTimeoutMS = 30000;
    static defaultUnloadTimeoutMS = 30000;
    
    
    private            _subcommandHashes: Map<DrBotSubcommand, string> = new Map(); 
    public             _subcommands: Map<string, DrBotSubcommand> = new Map();
    private            _filename: string = "";
    private            _fullPath: string = "";
    public             _loaded: boolean = false;
    public             cache: CacheManager = new CacheManager(new Map());
    protected          _commandSettings: DrBotEvCoSettings = {
        devOnly: false,
        mainOnly: false,
        setupTimeoutMS: DrBotCommand.defaultSetupTimeoutMS,
        unloadTimeoutMS: DrBotCommand.defaultUnloadTimeoutMS
    }
    protected abstract _slashCommand: DrBotSlashCommand;
    private            _hash: string = ""; //! Used to detect changes during reloads 
    private            _fileHash: string = ""; //! Used to detect changes during reloads
    private            client: Discord.Client;

    private            children: Map<string, DrBotSubcommand | DrBotSubcommandGroup> = new Map();

    constructor(client: Discord.Client, filename?: string) {
        this.client = client;
        this._fullPath = decodeURIComponent(new Error().stack.split("\n")[2].replace(/.*file:\/\//, "").replace(/:[0-9]+:[0-9]+.*/g, "").replace(/^\//, process.platform === "win32" ? "" : "/"))
        if (filename) this._filename = filename;
        else {
            //! Find the class caller, get their filename, and set it as the filename
            this._filename = path.basename(this._fullPath)
        }

        this._hash = crypto.createHash("md5").update(readFileSync(this._fullPath, 'utf-8')).digest("hex")
        this._fileHash = this._hash
    }

    public readonly setupSubCommands = async (client: Discord.Client) => {
        let hashes = []

        let groups = Array.from(global.subcommands.entries())
            .filter(([key]) => key.startsWith("G-"))
            .map(([, value]) => value)
            .filter((value) => value.parent === this.constructor)
            .map((value) => {
                let group: DrBotSubcommandGroup = new value();
                
                
                const setupResult = group.prep()
                if (!setupResult) {
                    global.logger.debugWarn(`Subcommand group ${group.constructor.name} is not setup correctly. Skipping...`, this.constructor.name);
                    return null;
                }

                return group;
            }).filter((value) => value !== null);
            
        for (let subcommand of Array.from(global.subcommands.keys()).filter((key) => key.startsWith("S-"))) {
            let subcommandClass = global.subcommands.get(subcommand);

            let parent = subcommandClass?.parent;

            if (!parent) {
                global.logger.debugWarn(`Subcommand ${subcommand} has no parent`, "DrBotCommand");
                continue
            }

            if (this.extendsDrBotSubcommandGroup(parent)) {
                let group = groups.find((group) => group.constructor === parent);

                if (group) {
                    global.logger.debug("Setting up subcommand: " + subcommand.split("@")[0].replace(/^S-/,"") + " in group: " + group.name, this._filename)
                    group.addChild(new subcommandClass());
                }
            } else if (this.extendsDrBotCommand(parent)) {
                if (parent !== this.constructor) continue
                global.logger.debug("Setting up subcommand: " + subcommand.split("@")[0].replace(/^S-/,"") + " in command: " + this._slashCommand.name, this._filename)
                this.addChild(new subcommandClass());
            }
        }

        for (let group of groups) {
            this.addGroup(group);
        }

        if (this._subcommands.size > 0) {
            hashes.push(this._hash)
            const sortedHashes = hashes.sort()

            const hash = crypto.createHash("md5").update(sortedHashes.join("")).digest("hex")
            this._hash = hash
        }
    }

    public abstract runCommand(interaction: Discord.ChatInputCommandInteraction): Promise<any>;
    public async autocomplete(interaction: Discord.AutocompleteInteraction): Promise<any> {
        return new Promise<void>(async (res) => res(await interaction.respond([])))
    }

    public get slashCommand() {return this._slashCommand}

    public get commandSettings() {return this._commandSettings}


    public async setup(client: Discord.Client, reason: "reload"|"startup"|"duringRun"|null): Promise<boolean> {
        this._loaded = true;    
        return true;
    };
    public async unload(client: Discord.Client, reason: "reload"|"shuttingDown"|null): Promise<boolean> {
        this._loaded = false;
        return true;
    }

    private parseDuration(durationStr) {
        const units = {
            'ms': 1,
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000,
            'mo': 31 * 24 * 60 * 60 * 1000,
            'y': 365 * 24 * 60 * 60 * 1000
        };
        
        const time = parseInt(durationStr.replace(/[a-zA-Z]/g,""))
        const unit = durationStr.match(/[a-zA-Z]/g).join("")  
      
        const duration = time * units[unit];
        return duration;
    }

    public get fileName() {
        return this._filename
    }

    public toString() {
        return this.valueOf()
    }

    public get hash() {
        return this._hash
    }
    public get fileHash() {
        return this._fileHash
    }
    
    public valueOf() {
        return (
            "C: " +
            this.constructor.name +
            " - " + this._filename
        )
    }

    public getSubCommands() {
        return this._subcommands
    }

    public async addChild(subcommand: DrBotSubcommand): Promise<boolean> {
        if (this._slashCommand == null) {
            throw new Error("Slash command is not initialized");
        }

        const setupResult = await subcommand.setup((async (scf: any) => {
            const sc = await scf(new Discord.SlashCommandSubcommandBuilder());
            (this._slashCommand as Discord.SlashCommandBuilder).addSubcommand(sc);
            subcommand._cmdName = sc.name;
            return sc;
        }), this.client);

        if (!setupResult) {
            global.logger.debugWarn(`Subcommand ${subcommand.constructor.name} is not setup correctly. Skipping...`, subcommand.constructor.name);
            return setupResult;
        }

        this.children.set(subcommand._cmdName, subcommand);

        return true;

    }

    private extendsDrBotCommand(command: any): command is typeof DrBotCommand {
      return command && command.prototype instanceof DrBotCommand;
    };

    private extendsDrBotSubcommandGroup(subcommandGroup: any): subcommandGroup is typeof DrBotSubcommandGroup {
      return subcommandGroup && subcommandGroup.prototype instanceof DrBotSubcommandGroup;
    };

    public getWithName(name: string): DrBotSubcommand | null {
        const split = name.split(" ")

        if (this.children.has(split[0])) {
            const child = this.children.get(split[0]);
            if (child instanceof DrBotSubcommand) {
                return child;
            } else if (child instanceof DrBotSubcommandGroup) {
                const subcommand = child.getWithName(split[1]);
                if (subcommand) {
                    return subcommand;
                }
            }
        }

        return null;
    }

    public addGroup(group: DrBotSubcommandGroup): void {
        if (this._slashCommand == null) {
            throw new Error("Slash command is not initialized");
        }

        if (this.children.has(group.name)) {
            throw new Error("Subcommand group is already attached to a command");
        }

        (this._slashCommand as Discord.SlashCommandBuilder).addSubcommandGroup(group.getGroup());
        this.children.set(group.name, group);
    }

}

