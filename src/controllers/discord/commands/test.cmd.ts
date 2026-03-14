import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
export default class Test extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("test")
    .setDescription("A simple test command");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.reply("Test command works.");
  }
}
