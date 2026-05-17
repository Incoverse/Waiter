/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
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

import CacheManager from "@/lib/cache.js";
import type TwitchClient from "@twitch/client.js";
import chalk from "chalk";
import { getCommandHandler } from "../../events/CommandHandler.evt.js";
import type { ChannelChatMessage, UserWhisperMessage } from "../../types.js";
import CooldownSystem from "../cooldown.js";


export type CommandScope = "dm" | "channel" | "both";

export type MessageBasedOnScope<T extends CommandScope> =
  T extends "dm" ? WhisperMessage :
  T extends "channel" ? ChannelMessage :
  WhisperMessage | ChannelMessage;

export type CommandSettings = {
  allowSelf?: boolean; //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope?: CommandScope; //! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
  onlyInTriggeredChannel?: boolean; //! In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if this is true, it will only trigger in the channel that the command was sent in.
}



const defaultSettings: CommandSettings = {
  allowSelf: false, //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope: "channel", //! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
  onlyInTriggeredChannel: true, //! In shared chat situations between multiple streamers where Waiter is enabled, the command executed in one stream will be handled on all streams, if this is true, it will only trigger in the channel that the command was sent in.
}

//! Scope - Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
export default abstract class WaiterCommand<T extends CommandScope = "channel"> { 
    protected bot: TwitchClient;

    public cooldown: CooldownSystem;

    public logger: Console;

    protected cache: CacheManager = new CacheManager();

    public loaded: boolean = false;

    public settings: CommandSettings = defaultSettings;

    public defaultEnabled: boolean = true; //! Whether the command is enabled by default when added to the system. This can usually be overridden by streamer-specific configuration.

    public constructor(bot: TwitchClient) {
      this.bot = bot;

      this.settings = {
        ...defaultSettings,
        ...this.settings,
      }

      this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
      this.cache.setLogger(this.logger);
      if (this.cooldown) this.cooldown.setLogger(this.logger);
    }

    /** The regex or function used to trigger the command on incoming messages. */
    public abstract messageTrigger: RegExp | ((event: MessageBasedOnScope<T>) => boolean | { [key: string]: string }); //! Trigger on message that matches this regex

    /**
     * Extract arguments from the message based on the messageTrigger regex or function.
     * @param event The message event to extract arguments from. This can be either a ChannelMessage or a WhisperMessage.
     * @param name The name of the argument to extract, if using a regex with named capture groups. Defaults to "args" for backward compatibility, but you can use any name that matches a named capture group in your regex.
     * @returns The extracted argument as a string, or null if the message does not match the trigger or the specified argument is not found.
     */
    public getArgs(event: MessageBasedOnScope<T>, name: string = "args"): string | null {
      if (this.messageTrigger instanceof RegExp) {
        const content = "broadcaster_user_login" in event ? event.message.text : event.whisper.text;
        const match = content.match(this.messageTrigger);

        if (!match) return null;
        
        if (match.groups && name in match.groups) {
          return match.groups[name] as string;
        }
      } else if (typeof this.messageTrigger === "function") {
        const result = this.messageTrigger(event);
        if (typeof result === "object" && name in result) {
          return result[name] as string;;
        }
      }
      return null;
    }


    /**
     * Setup the command
     * 
     * @param clients The TwitchClient instances that the command should be setup for. This can be useful for commands that need to register event listeners or perform other setup tasks on specific clients.
     * @param reason The reason for the setup being triggered. "initial" for the initial setup that runs during Waiter's start-up. "catch-up" is used to add specific events or perform specific tasks when a new TwitchClient instance is added after the initial setup, such as when a new streamer is added to the system while Waiter is already running.
     * 
     * Returns:
     * - `true` if the command was successfully setup
     * - `false` if the command failed to setup, and to announce that it failed
     * - `null` if the command failed to setup or is not needed, but to fail silently
     */
    public async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
      this.loaded = true;
      return this.loaded;
    }

    /**
     * Unload the command
     * 
     * Returns:
     * - `true` if the command was successfully unloaded
     * - `false` if the command failed to unload, and to announce that it failed
     * - `null` if the command failed to unload, but to fail silently
     */
    public async unload(clients: TwitchClient[], reason: "shutdown" | "other" = "shutdown"): Promise<boolean | null> {
      this.loaded = false;
      return this.loaded;
    }


    /**
     * Execute the command
     * @param channel The TwitchClient instance representing the channel where the command was triggered. For whispers, this will be the TwitchClient instance of the bot itself.
     * @param message The message object that triggered the command. This can be either a ChannelMessage or a WhisperMessage, depending on the scope of the command.
     * @returns A promise that resolves when the command execution is complete. The return value can be used to send a response message if needed.
     */
    public abstract exec(channel: TwitchClient, message: MessageBasedOnScope<T>): Promise<any>; //! Execute the command

    /**
     * Get the config key used to store this command's enabled state.
     */
    protected getConfigKey(): string {
      return `cmd${this.constructor.name.replace(/cmd$/i, "")}-enabled`;
    }

    /**
     * Check whether this command is enabled for the given channel.
     */
    public isEnabled(channel: TwitchClient): boolean {
      return channel.config?.[this.getConfigKey()] ?? this.defaultEnabled;
    }

    /**
     * Call another channel command based on message text.
     * Useful for creating aliases or delegating to other commands.
     * The command to execute is determined by matching the message text against all registered command triggers.
     * @param channel The TwitchClient representing the channel
     * @param message The channel message event object (text determines which command to execute)
     * @returns true if a command was found and executed, false otherwise
     */
    protected async callCommand(
      channel: TwitchClient,
      message: ChannelMessage
    ): Promise<boolean> {
      // Import here to avoid circular dependency
      const handler = getCommandHandler();
      
      if (!handler) {
        this.logger.warn("CommandHandler not initialized. Cannot call command.");
        return false;
      }

      return handler.callCommand(channel, message, this);
    }


    /** 
     * Check if the message is a whisper message
     * @param message The message to check
     * @returns `true` if the message is a whisper message, `false` otherwise. The message type also gets narrowed in the true branch, so if this function returns true, TypeScript will treat the message as a WhisperMessage.
     */
    protected isWhisperMessage(message: Message): message is WhisperMessage {
      return "whisper" in message;
    }

    /** 
     * Check if the message is a channel message
     * @param message The message to check
     * @returns `true` if the message is a channel message, `false` otherwise. The message type also gets narrowed in the true branch, so if this function returns true, TypeScript will treat the message as a ChannelMessage.
     */
    protected isChannelMessage(message: Message): message is ChannelMessage {
      return "message" in message && "broadcaster_user_login" in message;
    }


    public isDMCommand(): this is WaiterCommand<"dm"> {
      return this.settings.scope === "dm" || this.settings.scope === "both";
    }

    public isChannelCommand(): this is WaiterCommand<"channel"> {
      return this.settings.scope === "channel" || this.settings.scope === "both";
    }
}


export type ChannelMessage = ChannelChatMessage["event"];
export type WhisperMessage = UserWhisperMessage["event"];
export type Message = ChannelMessage | WhisperMessage;