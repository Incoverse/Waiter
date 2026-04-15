/*
  * Copyright (c) 2025 Inimi | InimicalPart | Incoverse
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
import type { ChannelChatMessage, UserWhisperMessage } from "../../types.js";
import CooldownSystem from "../cooldown.js";


export type CommandSettings = {
  allowSelf?: boolean; //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope?: "channel" | "dm" | "both"; //! Where the command can be triggered. "channel" for channel messages, "dm" for whispers, "both" for both.
}

const defaultSettings: CommandSettings = {
  allowSelf: false, //! Whether the command should be triggered by the bot's own messages. Use with caution to avoid potential loops.
  scope: "channel"
}

export default abstract class WaiterCommand {
    protected bot: TwitchClient;

    public cooldown: CooldownSystem;

    public logger: Console;

    protected cache: CacheManager = new CacheManager();

    public loaded: boolean = false;

    public settings: CommandSettings = defaultSettings;

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

    public abstract messageTrigger: RegExp | ((event: Message) => boolean | { [key: string]: string }); //! Trigger on message that matches this regex

    public getArgs(event: Message, name: string = "args"): string | null {
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
     * Returns:
     * - `true` if the command was successfully setup
     * - `false` if the command failed to setup, and to announce that it failed
     * - `null` if the command failed to setup or is not needed, but to fail silently
     */
    public async setup(clients: TwitchClient[]): Promise<boolean | null> {
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
    public async unload(clients: TwitchClient[]): Promise<boolean | null> {
      this.loaded = false;
      return this.loaded;
    }
    public abstract exec(channel: TwitchClient, message: Message): Promise<any>; //! Execute the command
}


export type ChannelMessage = ChannelChatMessage["event"];
export type WhisperMessage = UserWhisperMessage["event"];
export type Message = ChannelMessage | WhisperMessage;