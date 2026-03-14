import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { readFileSync } from "fs";
import path from "path";

const packageJsonPath = path.resolve(process.cwd(), "package.json");

export const data = new SlashCommandBuilder()
  .setName("version")
  .setDescription("Check which version Waiter is running.");

export async function execute(interaction: ChatInputCommandInteraction) {
  const version = JSON.parse(
    readFileSync(packageJsonPath, { encoding: "utf-8" }),
  ).version;

  await interaction.reply({
    content: `Waiter is currently running \`\`v${version}\`\``,
    flags: MessageFlags.Ephemeral,
  });
}
