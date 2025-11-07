/*
  * Copyright (c) 2025 Inimi | InimicalPart | Incoverse
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

import { CommandInteractionOptionResolver, SlashCommandBuilder } from "discord.js";
import * as Discord from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { promisify } from "util";
import {exec} from "child_process";
const execPromise = promisify(exec);
import moment from "moment-timezone";
import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import AdminDrBotGroup from "./_group.cmdlib.js";
import { breakObjectToString } from "@src/lib/utilities/misc.js";

enum ValuePossibility {
  Boolean = 1 << 0,
  JSON = 1 << 1,
  Number = 1 << 2,
  String = 1 << 3,

  AllowCustom = 1 << 4,

  Nullable = 1 << 5,
}


const nameMap: Map<RegExp, {
    name: string,
    possibility: number,
    choices?: ({ name: string, value: string }[] | (()=>{name:string, value:string}[])),
    validation?: (input: string) => Promise<boolean>,
    postProcessing?: (input: string) => Promise<any>
}> = new Map([
  [/^rewards\.wordle\.streak\.(\d+)\.format$/, { name: "Wordle reward message format ($1 days)", possibility: ValuePossibility.String }],
  [/^rewards\.wordle\.streak\.(\d+)\.type$/, { name: "Wordle reward type ($1 days)", possibility: ValuePossibility.String, choices: [
    { name: "None", value: "none" },
  ] }],
  [/^rewards\.wordle\.streak\.message$/, { name: "Default wordle reward message", possibility: ValuePossibility.String }],
  [/^lowPrivileged$/, { name: "Running low privileged?", possibility: ValuePossibility.Boolean }],
  [/^mainServer$/, { name: "Main Server ID", possibility: ValuePossibility.String }],
  [/^developmentServer$/, { name: "Development Server ID", possibility: ValuePossibility.String }],
  [/^starboard\.enabled$/, { name: "Starboard enabled?", possibility: ValuePossibility.Boolean }],
  [/^starboard\.triggerAmount$/, { name: "Starboard reaction trigger amount", possibility: ValuePossibility.Number }],
  [/^starboard\.emoji$/, { name: "Starboard emoji", possibility: ValuePossibility.String }],
  [/^starboard\.channel$/, { name: "Starboard channel", possibility: ValuePossibility.String | ValuePossibility.Nullable }],
  [/^backupStoragePath$/, { name: "Storage path if MongoDB fails", possibility: ValuePossibility.String }],
  [/^skipMongoFailWait$/, { name: "Skip waiting if MongoDB fails", possibility: ValuePossibility.Boolean }],
]);

export const keyResolver = (key: string) => {
  for (const [regex, details] of nameMap.entries()) {
    if (regex.test(key)) {
      details.name = key.replace(regex, details.name);
      return details
    }
  }
  return null;
}

function getChoices(key: string): { name: string, value: string }[] {
      let keyDetails = keyResolver(key);
      if (!keyDetails) {
        keyDetails = {
          name: key,
          possibility: Object.values(ValuePossibility)
          .filter(v => typeof v === "number")
          .reduce((acc, v) => acc | (v as number), 0)
        }
      }
    let choices: { name: string, value: string }[] = [];
    if ((keyDetails.possibility & ValuePossibility.Boolean) == ValuePossibility.Boolean) {
        choices.push({
            name: "True",
            value: "true"
        })
        choices.push({
            name: "False",
            value: "false"
        })
    }
    if ((keyDetails.possibility & ValuePossibility.Nullable) == ValuePossibility.Nullable) {
        choices.push({
            name: "Null",
            value: "null"
        })
    }

    if (keyDetails.choices) {
        if (typeof keyDetails.choices == "function") {
            choices = choices.concat(keyDetails.choices());
        } else {
            choices = choices.concat(keyDetails.choices);
        }
    }

    return choices;
}

export default class DrBotConfigure extends DrBotSubcommand {

    static parent = AdminDrBotGroup;


  

    public async autocomplete(interaction: Discord.AutocompleteInteraction) {
      console.log(interaction)
      const optionName = interaction.options.getFocused(true).name
      const focusedValue = interaction.options.getFocused();
      
      if (optionName == "key") {
          const choices = breakObjectToString(global.app.config).map((conf) => {
              return {
                  name: keyResolver(conf)?.name || conf,
                  value: conf
              }
          })
          await interaction.respond(choices.filter((choice) => choice.name.toLowerCase().includes(focusedValue.toLowerCase()) || choice.value.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25));
      } else if (optionName == "value") {
          const key = interaction.options.getString("key");

          if (!key) {
              return interaction.respond([
                  {
                      name: "Provide a key first",
                      value: "none"
                  }
              ]);
          }

          const choices = []//this.getChoices(key).toSorted((a, b) => a.name.localeCompare(b.name));

          if (choices.length == 0) {
              return interaction.respond([
                  {
                      name: "No choices available",
                      value: "none"
                  }
              ]);
          }

          await interaction.respond(choices.filter((choice) => choice.name.toLowerCase().includes(focusedValue.toLowerCase()) || choice.value.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25));
      }
    }


  public async setup(addCallback, client: Discord.Client<boolean>): Promise<boolean> {
      await addCallback((subcommand: Discord.SlashCommandSubcommandBuilder) =>
        subcommand
          .setName("configure")
          .setDescription("Configure DrBot.")
          .addStringOption((option) => 
            option
              .setAutocomplete(true)
              .setName("key")
              .setDescription("The key to configure.")
              .setRequired(true)
          )
          .addStringOption((option) => 
            option
              .setAutocomplete(true)
              .setName("value")
              .setDescription("The key to configure.")
              .setRequired(true)
          )
      )

      this._loaded = true;
      return true;
  }

  public async runSubCommand(interaction: Discord.ChatInputCommandInteraction) {
    return interaction.reply({
      content: "This command is not implemented yet.",
      ephemeral: true
    });
  }


}

declare const global: DrBotGlobal;
const __filename = fileURLToPath(import.meta.url);

export async function runSubCommand(interaction: Discord.ChatInputCommandInteraction) {
  console.log(interaction)

  return interaction.reply({
    content: "This command is not implemented yet.",
    ephemeral: true
  });
  
  
}

export const returnFileName = () => __filename.split(process.platform == "linux" ? "/" : "\\")[__filename.split(process.platform == "linux" ? "/" : "\\").length - 1];