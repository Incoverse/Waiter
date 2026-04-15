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
import { chooseArticle } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand, { type ChannelMessage } from "@twitch/lib/base/WaiterCommand";
import CooldownSystem, { CooldownWrapper } from "@twitch/lib/cooldown";
import { StreamerHasSpotifyLinked, StreamerIsLive } from "../../lib/conditions";


export default class PlayCMD extends WaiterCommand {
  public messageTrigger: RegExp = /^!play\s+(?<args>.+)$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "10s",
  });

  @StreamerIsLive() //? <-- Streamer must be live to use the command, since it doesn't make sense to check the currently playing song if the stream isn't live.
  @StreamerHasSpotifyLinked() //? <-- Streamer must have their Spotify account linked to use the command, since we need access to their Spotify data to get the currently playing song.
  @CooldownWrapper() //? <-- Apply the cooldown to prevent spam, since fetching the currently playing song involves making requests to the Spotify API which could potentially be rate limited if abused.
  public async exec(channel: TwitchClient, message: ChannelMessage): Promise<any> {

    const spotify = getSpotifyClient(channel.waiterUserId);

    if (!spotify) {
      this.logger.error(`Failed to get Spotify client for streamer ${message.broadcaster_user_login} (${message.broadcaster_user_id})`);
      return;
    }


    const userInput = this.getArgs(message)!;

    if (!userInput || userInput.trim() === "") {
      return this.bot.channel(channel).sendMessage(`Please provide a song name or Spotify track URL/URI to play!`, { replyTo: message.message_id });
    }

    const songId = resolveId(userInput.trim());

    if (!songId) {
      //? Attempt to search for the song by name if the input isn't a valid Spotify URL/URI
    } else {
      //? Fetch the song, check if it's a track, then queue it

      const trackInfo = await spotify.playable.get(songId).catch((e) => {
        this.logger.warn(`Error fetching track info for ID ${songId}:`, e.response?.data?.error?.message || e.response?.data || e.message);
        return null;        
      })

      if (!trackInfo) {
        return this.bot.channel(channel).sendMessage(`Could not find a track with the provided ID!`, { replyTo: message.message_id });
      }

      if (trackInfo.type !== "track") {
        return this.bot.channel(channel).sendMessage(`It seems you've provided ${chooseArticle(trackInfo.type)} ${trackInfo.type} instead of a track. Currently, only tracks can be played!`, { replyTo: message.message_id });
      }

      const addedToQueue = await spotify.playback.addToQueue(trackInfo.uri).catch((e) => {
        this.logger.warn(`Error adding track ${trackInfo.uri} to queue:`, e.response?.data?.error?.message || e.response?.data || e.message);
        this.bot.channel(channel).sendMessage(`Failed to add "${trackInfo.name}" to the queue. Please try again later!`, { replyTo: message.message_id });
        return false;
      })

      if (addedToQueue) {
        let artistsByName = trackInfo.artists.map((a: any) => a.name)

        let artistString = "";
        if (artistsByName.length > 2) {   
          //? Artist A, Artist B, and Artist C
          artistString = artistsByName.slice(0, -1).join(", ") + ", and " + artistsByName.slice(-1);
        } else {
          //? Artist A
          //? Artist A and Artist B
          artistString = artistsByName.join(" and ");
        }

        return this.bot.channel(channel).sendMessage(`Queued: "${trackInfo.name}" by ${artistString}!`, { replyTo: message.message_id });
      }
    }

  }
}