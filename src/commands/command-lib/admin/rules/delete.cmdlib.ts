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

import { DrBotSubcommand } from "@src/lib/base/DrBotSubcommand.js";
import storage from "@src/lib/utilities/storage.js";
import { AutocompleteInteraction, Client, CommandInteraction, CommandInteractionOptionResolver, SlashCommandBuilder, SlashCommandSubcommandBuilder } from "discord.js";
import AdminRulesGroup from "./_group.cmdlib.js";

export default class RulesDelete extends DrBotSubcommand {

    static parent = AdminRulesGroup;

    public async setup(addCallback, client: Client<boolean>): Promise<boolean> {
      await addCallback((subcommand: SlashCommandSubcommandBuilder) =>
        subcommand
        .setName("delete")
        .setDescription("Delete a rule")
        .addStringOption((option) =>
          option
            .setName("rule")
            .setDescription("The rule you want to delete")
            .setRequired(true)
            .setAutocomplete(true)

        )
      )


      this._loaded = true;
      return true;
  }

  public async autocomplete(interaction: AutocompleteInteraction) {
    const optionName = interaction.options.getFocused(true).name
    const focusedValue = interaction.options.getFocused();
    
    if (optionName == "rule") {
        const choices = global.server.main.rules.map((rule) => {
            return {
                name: `${rule.index}. ${rule.title}`,
                value: `${rule.title}`
            }
        }) 
           
        await interaction.respond(choices.filter((choice) => choice.name.toLowerCase().includes(focusedValue.toLowerCase())).slice(0, 25));
    }
  }

  public async runSubCommand(interaction: CommandInteraction) {
          
      if (
          (interaction.options as CommandInteractionOptionResolver).getSubcommandGroup() !== "rules" ||
          (interaction.options as CommandInteractionOptionResolver).getSubcommand() !== "delete"
        ) return


        let ruleName = (interaction.options as CommandInteractionOptionResolver).getString("rule", true);
        if (ruleName.match(/^[0-9]+\.\s/gm)) ruleName = ruleName.replace(/^[0-9]+\.\s/gm, ""); //! If the index accidentally gets added to the rule name, remove it.
      
        const rule = global.server.main.rules.find((rulee) => rulee.title == ruleName);
      
        if (!rule) {
            return await interaction.reply({
                content: "Rule not found.",
                ephemeral: true
            })
         }
      
      
        const newRules = global.server.main.rules.filter((r) => r.index !== rule.index);
      
        //fix indexes
        let i = 0;
        for (const r of newRules.sort((a, b) => a.index - b.index)) {
          i++
          r.index = i;
        }
      
        global.server.main.rules = newRules;
      
        try {
      
          await storage.updateOne("server", {}, { $set: { rules: newRules } }).then(async () => {
            
            await interaction.reply({
              content: `Rule ${rule.index} has been deleted.`,
              ephemeral: true,
            });
      
          })
        } catch (e) {
          global.logger.error(e.toString(), this.fileName);
          await interaction.reply({
            content: "An error occurred while deleting the rule.",
            ephemeral: true,
          });
        }
      
      
  }
}