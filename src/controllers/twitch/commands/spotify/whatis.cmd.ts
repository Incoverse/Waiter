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

import { getSpotifyClient } from "@/controllers/spotify/lib/misc";
import { resolveId } from "@/controllers/spotify/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import CooldownSystem, { CooldownWrapper } from "@twitch/lib/cooldown";
import { StreamerHasSpotifyLinked, StreamerIsLive } from "../../lib/conditions";
import { RequiresPermission, TwitchPermissions } from "../../lib/misc";


export default class WhatIsCMD extends WaiterCommand {
  public messageTrigger: RegExp = /^!whatis\s+(.*)$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
  });

  @RequiresPermission(TwitchPermissions.Developer) //? <-- User is a Waiter Developer (Temporarily require developer permissions while the command is being tested.)
  @StreamerIsLive() //? <-- Streamer must be live to use the command, since it doesn't make sense to check the currently playing song if the stream isn't live.
  @StreamerHasSpotifyLinked() //? <-- Streamer must have their Spotify account linked to use the command, since we need access to their Spotify data to get the currently playing song.
  @CooldownWrapper() //? <-- Apply the cooldown system to this command.
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const spotify = getSpotifyClient(channel.waiterUserId);

    if (!spotify) {
      this.logger.error(`Failed to get Spotify client for streamer ${message.broadcaster_user_login} (${message.broadcaster_user_id})`);
      return;
    }

    const arg1 = message.message.text.match(this.messageTrigger)?.[1].trim();
    
    if (!arg1) {
      return this.bot.channel(channel).sendMessage(`Please provide a Spotify track, album, artist, or playlist URL or URI!`, { replyTo: message.message_id });
    }

    const sid = resolveId(arg1);

    if (!sid) {
      return this.bot.channel(channel).sendMessage(`Could not resolve a Spotify ID from your input.`, { replyTo: message.message_id });
    }

    const thing = await spotify.playable.get(sid);

    if (!thing) {
      return this.bot.channel(channel).sendMessage(`Could not find any Spotify item with the provided ID.`, { replyTo: message.message_id });
    }

    return this.bot.channel(channel).sendMessage(`That is ${thing.type} "${thing.name}"`, { replyTo: message.message_id });



  }
}