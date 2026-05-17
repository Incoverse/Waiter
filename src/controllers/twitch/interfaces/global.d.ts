import type Communication from "@/lib/communication";
import type TwitchClient from "@twitch/client";
import type TwitchController from "..";
import type { TwitchEventInfo } from "../lib/base/WaiterEvent";

declare global {
  var twitch: {
    /** The Twitch controller instance. */
    controller: TwitchController;
    /** The authentication to Twitch's API using an app access token, which is used for sending messages so we get the chat bot badge. */
    appAuth: TwitchAppAuth;
    /** The communication module for Twitch-related interactions. */
    communication: Communication;
    /** The Twitch bot client instance. */
    bot: TwitchClient;
    /** A map of Twitch clients, keyed by streamer ID. */
    streamers: Map<string, TwitchClient>;
    /** A volatile memory for storing Twitch-related data, such as streamer statuses and lurker information. */
    streamerData: {
      [streamerId: string]: Partial<{
        /** Whether the streamer is currently live. */
        isStreaming: boolean;
        /** Viewers who are currently lurking (viewing the stream without active participation). */
        lurkedUsers: { id: string; login: string; display_name: string }[];
        /** Twitch events that require affiliate/partner status and are waiting to be registered. */
        pendingAffiliateEvents: TwitchEventInfo[];
      }>;
    }
    /** Bypasses that are set by the Waiter developer. */
    bypasses: Set<Bypass>;
  }
}

export { };


type Bypass = 
  LiveBypass;

type LiveBypass = {
  /** The type of bypass, e.g., "permission", "cooldown", etc. */
  type: "live";
  /** The ID of the streamer for whom the bypass is set. Can be "all" to bypass for all channels. */
  scope: string;
}
