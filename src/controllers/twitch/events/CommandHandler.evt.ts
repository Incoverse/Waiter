import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage, type MessageBasedOnScope } from "@twitch/lib/base/WaiterCommand";
import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";
import { isChannelChatMessage, type ChannelChatMessage, type UserWhisperMessage } from "../types";

let globalCommandHandler: TCMD | null = null;

/**
 * Get the global command handler instance. Used internally by commands to call other commands.
 */
export function getCommandHandler(): TCMD | null {
  return globalCommandHandler;
}

export default class TCMD extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender, broadcaster }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "channel.chat.message",
      version: 1,
      condition: { "user_id": sender?.IAM?.id ?? "NONE", broadcaster_user_id: broadcaster?.IAM?.id ?? "NONE" },
    },
  });

  public override registerTwitchEvents({ sender }: BroadcasterSender): TwitchEventInfo[] {
    return [
      {
        as: "sender",
        name: "user.whisper.message",
        version: 1,
        condition: { "user_id": sender?.IAM?.id ?? "NONE" },
      }
    ]
  }

  private commands: WaiterCommand[] = [];

  public override async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {

    if (reason === "catch-up") {
      console.debug("Running catch-up setup for commands...");
      for (const command of this.commands) {
        if (command.loaded) {
          const setupResult = await command.setup(clients, reason);
          if (setupResult === false) {
            this.logger.warn(`Failed to setup command ${command.constructor.name} during catch-up. Skipping.`);
            continue;
          }
        }
      }
      return true;
    }

    const commands = (await Promise.all(
      findFiles(global.isCompiled ? "dist" : "src", /[\\/]twitch[\\/].*\.cmd\..s$/)
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterCommand)) as (new (bot: TwitchClient) => WaiterCommand)[];

    this.logger.info(`Found ${commands.length} command(s). Setting up...`);

    for (const cmd of commands) {
      const commandInstance = new cmd(this.bot);
      const setupResult = await commandInstance.setup(clients, reason);

      if (setupResult === false) {
        this.logger.warn(`Failed to setup command ${cmd.name}. Skipping.`);
        continue;
      } else if (setupResult === null) {
        continue
      }

      this.commands.push(commandInstance);
    }

    globalCommandHandler = this;
    return super.setup(clients, reason);

  }

  /**
   * Find and execute a channel command based on the message text.
   * Useful for delegating to other commands from within a command's exec method.
   * @param channel The TwitchClient representing the channel to execute the command in
   * @param message The channel message event object with the text to match against command triggers
   * @returns true if a matching command was found and executed, false otherwise
   */
  public async callCommand(
    channel: TwitchClient,
    message: ChannelMessage,
    caller: WaiterCommand<"channel" | "both" | "dm">
  ): Promise<boolean> {
    for (const command of this.commands.filter(cmd => cmd.isChannelCommand())) {
      if (!command.isEnabled(channel)) {
        continue;
      }

      if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(message.message.text)) {
        this.logger.withPrefix(`[${channel.IAM.login} - ${command.constructor.name} (via callCommand)]`).log(`Forwarding command call from ${caller.constructor.name} with message: "${message.message.text}"`);
        await command.exec(channel, message);
        return true;
      } else if (typeof command.messageTrigger === "function") {
        const result = command.messageTrigger(message);
        if (result) {
          this.logger.withPrefix(`[${channel.IAM.login} - ${command.constructor.name} (via callCommand)]`).log(`Forwarding command call from ${caller.constructor.name} with message: "${message.message.text}"`);
          await command.exec(channel, message);
          return true;
        }
      }
    }

    return false;
  }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: ChannelChatMessage | UserWhisperMessage): Promise<void> {

    if (isChannelChatMessage(data)) {
      const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
      if (!streamer) {
        this.logger.warn(`Received event for unregistered streamer with ID ${source.IAM.id}. Ignoring.`);
        return;
      }

      for (const command of this.commands.filter(cmd => cmd.isChannelCommand())) {
        if (!command.isEnabled(streamer)) {
          continue;
        }

        if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(data.event.message.text)) {
          //? If the command doesn't allow self-triggering and the message was sent by the bot, ignore it to prevent potential loops.
          if (data.event.chatter_user_id === source.IAM.id && !command.settings.allowSelf) {
            return;
          }

          //? In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if the command's settings specify that it should only trigger in the channel that the command was sent in, ignore it if the event has a source_broadcaster_user_id (indicating it's from a different channel).
          if (command.settings.onlyInTriggeredChannel && !!data.event.source_broadcaster_user_id) {
            return;
          }

          this.logger.withPrefix(`[${streamer.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.chatter_user_name} with message: "${data.event.message.text}"`);
          command.exec(streamer, data.event);
        } else if (typeof command.messageTrigger === "function") {
          const result = command.messageTrigger(data.event)
          //? If the command doesn't allow self-triggering and the message was sent by the bot, ignore it to prevent potential loops.
          if (data.event.chatter_user_id === source.IAM.id && !command.settings.allowSelf) {
            return;
          }
          
          //? In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if the command's settings specify that it should only trigger in the channel that the command was sent in, ignore it if the event has a source_broadcaster_user_id (indicating it's from a different channel).
          if (command.settings.onlyInTriggeredChannel && !!data.event.source_broadcaster_user_id) {
            return;
          }

          if (result) {
            this.logger.withPrefix(`[${streamer.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.chatter_user_name} with message: "${data.event.message.text}"`);
            command.exec(streamer, data.event);
          }
        }
      }
    } else {
      for (const command of this.commands.filter(cmd => cmd.isDMCommand())) {
        if (!command.isEnabled(source)) {
          continue;
        }

        if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(data.event.whisper.text)) {
          if (data.event.from_user_id === source.IAM.id && !command.settings.allowSelf) {
            return;
          }
          this.logger.withPrefix(`[WHISPER - ${source.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.from_user_name} with message: "${data.event.whisper.text}"`);
          command.exec(source, data.event);
        } else if (typeof command.messageTrigger === "function") {
          const messageTrigger = command.messageTrigger as (event: MessageBasedOnScope<"dm">) => boolean | { [key: string]: string };
          const result = messageTrigger(data.event as MessageBasedOnScope<"dm">);
          if (data.event.from_user_id === source.IAM.id && !command.settings.allowSelf) {
            return;
          }

          if (result) {
            this.logger.withPrefix(`[WHISPER - ${source.IAM.login} - ${command.constructor.name}]`).log(`Command was triggered by ${data.event.from_user_name} with message: "${data.event.whisper.text}"`);
            command.exec(source, data.event);
          }
        }
      }
    }
  }
}