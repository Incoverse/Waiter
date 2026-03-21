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
import WaiterEvent, { type BroadcasterSender, type EventInfo, type TwitchEventInfo } from "../lib/base/WaiterEvent";
import type { StreamOffline, StreamOnline } from "../types";


export default class OnStreamStatusChange extends WaiterEvent {
    public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Waiter:start",
      priority: 500
    })

    public override registerTwitchEvents({ broadcaster, sender: _ }: BroadcasterSender): TwitchEventInfo[] {
      return [
        {
          as: "sender",
          name: "stream.online",
          version: 1,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id,
          }
        },
        {
          as: "sender",
          name: "stream.offline",
          version: 1,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id,
          }
        },
      ]
    }

    public override exec(clients: TwitchClient[]): Promise<void>;
    public override exec(source: TwitchClient, data: StreamOnline | StreamOffline): Promise<void>;
    public override async exec(source: TwitchClient | TwitchClient[], data?: StreamOnline | StreamOffline): Promise<void> {

      if (Array.isArray(source)) {
        const streamers = source.filter((client) => !client.isBot);

        for (const streamer of streamers) {
          const isStreaming = await streamer.isStreaming();

          this.logger.log(`[${streamer.IAM.login}] Stream is currently ${isStreaming ? "online" : "offline"}`);
          global.twitch.streamerData[streamer.IAM.id].isStreaming = isStreaming;

          if (isStreaming) {
            global.twitch.communication.emit("stream.online", streamer, { beforeStart: true });
          } else {
            global.twitch.communication.emit("stream.offline", streamer, { beforeStart: true });
          }
        }
      } else {
        if (data.subscription.type === "stream.online") {
          const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
          if (!streamer) {
            this.logger.warn(`Received stream.online event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
            return;
          }

          global.twitch.streamerData[streamer.IAM.id].isStreaming = true;
          this.logger.log(`[${streamer.IAM.login}] Stream is now online`);
          global.twitch.communication.emit("stream.online", streamer, data.event);
        } else if (data.subscription.type === "stream.offline") {
          const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);

          if (!streamer) {
            this.logger.warn(`Received stream.offline event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
            return;
          }
          global.twitch.streamerData[streamer.IAM.id].isStreaming = false;
          this.logger.log(`[${streamer.IAM.login}] Stream is now offline`);
          global.twitch.communication.emit("stream.offline", streamer, data.event);
        }
      }
    }
}