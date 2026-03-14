import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("test")
  .setDescription("A simple test command");

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply("Test command works.");
}
