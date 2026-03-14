import { Controller } from "@/lib/base/controller";
import { getAllModules, importLocalModule } from "@/lib/misc";
import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import path from "path";
import { fileURLToPath } from "url";

type SlashCommandModule = {
  data?: SlashCommandBuilder;
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export default class DiscordController extends Controller {
  constructor() {
    super("DISC");
  }

  public async exec() {
    this.logger.info("Initializing Discord client...");
    const client = new Client({
      intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessagePolls,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildExpressions,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessagePolls,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.GuildScheduledEvent,
        Partials.Message,
        Partials.Poll,
        Partials.PollAnswer,
        Partials.Reaction,
        Partials.SoundboardSound,
        Partials.ThreadMember,
        Partials.User,
      ],
    });

    client.on(Events.ClientReady, () => {
      this.logger.info(`Logged in as ${client.user?.tag}!`);
    });

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    // If configured register to specific guild for faster registration
    const guildId = process.env.DISCORD_GUILD_ID;

    if (!token || !clientId) {
      this.logger.error(
        "Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.",
      );
      return;
    }

    const discordControllerDir = path.dirname(fileURLToPath(import.meta.url));
    const commandDir = path.resolve(discordControllerDir, "commands");
    const commandPaths = await getAllModules(commandDir, /\.cmd\.[tj]s$/);
    const importedModules = await Promise.all(
      commandPaths.map(importLocalModule),
    );

    const commands = importedModules
      .map((mod) => ({
        data: mod.data ?? (mod.default as SlashCommandModule | undefined)?.data,
        execute:
          mod.execute ??
          (mod.default as SlashCommandModule | undefined)?.execute,
      }))
      .filter((mod): mod is Required<SlashCommandModule> => {
        if (!mod.data || !mod.execute) {
          return false;
        }

        return true;
      });

    if (!commands.length) {
      this.logger.warn("No slash commands found to register.");
    }

    const commandMap = new Map(
      commands.map((command) => [command.data.name, command]),
    );

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commandMap.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        this.logger.error(
          `Error while executing command \"${interaction.commandName}\"`,
          err,
        );

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "There was an error while executing this command.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await interaction.reply({
          content: "There was an error while executing this command.",
          flags: MessageFlags.Ephemeral,
        });
      }
    });

    const rest = new REST({ version: "10" }).setToken(token);
    const commandJson = commands.map((command) => command.data.toJSON());

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commandJson,
      });
      this.logger.info(
        `Registered ${commandJson.length} guild slash command(s).`,
      );
    } else {
      await rest.put(Routes.applicationCommands(clientId), {
        body: commandJson,
      });
      this.logger.info(
        `Registered ${commandJson.length} global slash command(s).`,
      );
    }

    client.login(token).catch((err) => {
      this.logger.error("Failed to login to Discord", err);
    });
  }
}
