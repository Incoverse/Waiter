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

import {CommandInteractionOptionResolver,} from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);


import { DrBotCommand, DrBotSlashCommand } from "@src/lib/base/DrBotCommand.js";

declare const global: DrBotGlobal;

export default class Admin extends DrBotCommand {
  protected _slashCommand: DrBotSlashCommand = new Discord.SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin Commands")


  public async runCommand(interaction: Discord.ChatInputCommandInteraction) {
    await Promise.all(Array.from(this._subcommands.values()).map((subcommand) => subcommand.runSubCommand(interaction)))
  }
}