import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { WaiterCommand } from "../lib/base/WaiterCommand";
export default class Ping extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    await interaction.reply("Pong!");
  }

}

