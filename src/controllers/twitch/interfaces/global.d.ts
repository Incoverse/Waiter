import type Communication from "@/lib/communication";
import type TwitchClient from "@twitch/client";
import type TwitchController from "@twitch";

declare global {
  var twitch: {
    controller: TwitchController;
    communication: Communication;
    streamers: Map<string, TwitchClient>;
    streamerData: {
      [streamerId: string]: Partial<{
        isStreaming: boolean;
        lurkedUsers: { id: string; login: string; display_name: string }[];
      }>;
    }
  }
}

export { };

