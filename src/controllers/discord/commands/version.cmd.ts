import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { readFileSync } from "fs";
import path from "path";
import { WaiterCommand } from "../lib/base/WaiterCommand";
export default class Version extends WaiterCommand {
  protected _slashCommand = new SlashCommandBuilder()
    .setName("version")
    .setDescription("Check which version Waiter is running.");

  public async runCommand(interaction: ChatInputCommandInteraction) {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const version = JSON.parse(
      readFileSync(packageJsonPath, { encoding: "utf-8" }),
    ).version;

    await interaction.reply({
      content: `Waiter is currently running \`\`v${version}\`\``,
      flags: MessageFlags.Ephemeral,
    });
  }
}
