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
import { StreamerIsLive } from "../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../lib/misc";


export default class ShoutoutCMD extends WaiterCommand {
    public messageTrigger: RegExp = /^!(so|shoutout)\s+(?<username>[\w\d_@]+)$/;

    @RequiresPermission(TwitchPermissions.Helper)
    @StreamerIsLive()
    public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {
    let username = this.getArgs(message, "username")!;
    
    if (username.startsWith("@")) {
      username = username.slice(1);
    }
    
    const user = await this.bot.fetchUser(username);
    
    if (!user) {
      return await this.bot.channel(channel).sendMessage(`I couldn't find a user with the name "${username}"`, {
        replyTo: message.message_id
      });
    }
    
    const colors = ["purple", "blue"]

    const msg = `Go check out ${user.display_name} at https://twitch.tv/${user.login}!`;
    try {
      await this.bot.channel(channel).announce(msg, colors[Math.floor(Math.random() * colors.length)] as "purple" | "blue");
    } catch (error) {
      await this.bot.channel().sendMessage(msg, { replyTo: message.message_id });
    }
    

    try {
      await this.bot.channel(channel).shoutout(user.id);
    } catch (error) {}
  }
}