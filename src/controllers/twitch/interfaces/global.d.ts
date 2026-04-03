import type Communication from "@/lib/communication";
import type TwitchClient from "@twitch/client";
import type TwitchController from "..";

declare global {
  var twitch: {
    /** The Twitch controller instance. */
    controller: TwitchController;
    /** The communication module for Twitch-related interactions. */
    communication: Communication;
    /** A map of Twitch clients, keyed by streamer ID. */
    streamers: Map<string, TwitchClient>;
    /** A volatile memory for storing Twitch-related data, such as streamer statuses and lurker information. */
    streamerData: {
      [streamerId: string]: Partial<{
        /** Whether the streamer is currently live. */
        isStreaming: boolean;
        /** Viewers who are currently lurking (viewing the stream without active participation). */
        lurkedUsers: { id: string; login: string; display_name: string }[];
      }>;
    }
  }
}

export { };

