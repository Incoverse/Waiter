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

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import { parameterize, RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class SendAsStreamerCMD extends WaiterCommand {
  public messageTrigger: RegExp = /^!(send as (streamer|s)|sas|ssay)\s+(?<args>.*)/;

  @RequiresPermission(TwitchPermissions.Developer)
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    const commandArgs = parameterize((await this.getArgs(message))!, ["message"]);
    
    // needs to have message
    if (!commandArgs.message) {
      return this.bot.channel(channel).sendMessage("Invalid command format. Use: !send as streamer message=<message> [reply=true]", { replyTo: message.message_id });
    }
  
    await channel.channel().sendMessage(commandArgs.message, commandArgs.reply ? {
      replyTo: message.message_id
    } : {});
    
  }
}