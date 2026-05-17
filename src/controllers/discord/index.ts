import { Controller } from "@/lib/base/controller";
import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import chalk from "chalk";
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
import { z, type ZodType } from "zod";
import { WaiterCommand } from "./lib/base/WaiterCommand";

type SlashCommandModule = {
  data?: SlashCommandBuilder;
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export default class DiscordController extends Controller {
  constructor() {
    super("DISC", "#7289da");
  }

  public override registerConfig(): ZodType | void {
    return z.object({
      discord: z.object({
        serverId: z.string().describe("The bot will only register slash commands to this guild.")
          .refine((id) => /^\d+$/.test(id), "Server ID must be a string of digits.")
          .refine((id) => id !== "1234567891234567890", "Please set a valid Discord server ID in the configuration."),
      })
    }) satisfies z.ZodType<Pick<WaiterConfig, "discord">>
  }

  public async exec() {
    if (!global.discord) {
      global.discord = {
        controller: this,
        client: new Client({
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
        }),
      };
    }

    const client = global.discord.client;

    client.on(Events.ClientReady, () => {
      this.logger.perf(`Successfully logged in to Discord as ${client.user?.tag}!`);
    });

    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!token || !clientId || !clientSecret) {
      this.logger.fatal(
        "Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_CLIENT_SECRET in environment.",
      );
      return;
    }

    const commandPaths = await findFiles(global.isCompiled ? "dist" : "src", /[\\/]discord[\\/].*\.cmd\..s$/);
    const importedModules = await Promise.all(
      commandPaths.map(importLocalModule),
    );

    const commands: WaiterCommand[] = importedModules
      .map((mod) => mod.default) //? <-- default exported class
      .filter((cls) => !!cls) //? <-- remove all modules that dont have a default export
      .filter((cls) => extendsClass(cls, WaiterCommand)) //? <-- Only allow classes that extend WaiterCommand
      .map((defaultClass) => new defaultClass()); //? <-- instantiate the command classes

    if (!commands.length) {
      this.logger.warn("No slash commands found to register.");
    }

    const commandMap = new Map(
      commands.map((command) => [command.slashCommand.name, command]),
    );

    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commandMap.get(interaction.commandName);
      if (!command) return;

      try {
        await command.runCommand(interaction);
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
    const commandJson = commands.map((command) => command.slashCommand.toJSON());

    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(clientId, global.config.discord.serverId), {
      body: commandJson,
    });
    this.logger.info(
      `Registered ${commandJson.length} guild slash command(s).`,
    );
    

    client.login(token).catch((err) => {
      this.logger.error("Failed to login to Discord. Please check your token and internet connection.", err);
    });
  }

  public override async statuses(): Promise<void> {
    if (global.discord.client?.user) {
      this.logger.log(`Logged in to Discord as ${chalk.yellow(global.discord.client.user.tag)}`);
    }
  }
}
