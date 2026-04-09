import { getSpotifyClient } from "@/controllers/spotify/lib/misc";
import { getDiscord } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import type WaiterCommand from "./base/WaiterCommand";
import type { ChannelMessage, Message } from "./base/WaiterCommand";


function liveBypassCheck(channel: TwitchClient) {
  const bypass = Array.from(global.twitch.bypasses.values()).filter(b => b.type === "live");

  return bypass.some(b => b.scope === channel.IAM.id || b.scope === "all" || b.scope === null);
}

/** Decorator for checking if a streamer is live */
export function StreamerIsLive(silent: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: ChannelMessage, ...args: any[]
    ) {
      if (!global.twitch.streamerData[source.IAM.id]?.isStreaming) {

        if (!liveBypassCheck(source)) { 
          this.logger.debug(`Command is being blocked because streamer ${source.IAM.display_name} (ID: ${source.IAM.id}) is not live.`);
          if (!silent) {
            await this.bot.channel(source).sendMessage(`This command can only be used while the stream is live!`, { replyTo: message.message_id });
          }
          return;
        }

        this.logger.warn(`Streamer ${source.IAM.display_name} (ID: ${source.IAM.id}) is not live, but a bypass is allowing the command to execute.`);
      }

      return originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  };
}

/** Decorator for checking if a user is a registered streamer in the Waiter system */
export function UserIsRegisteredStreamer(silent: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: Message, ...args: any[]
    ) {

      const userId = "chatter_user_id" in message ? message.chatter_user_id : message.from_user_id;

      if (!userId || !global.twitch.streamerData[userId]) {
        this.logger.debug(`Command is being blocked because user ${"chatter_user_name" in message ? message.chatter_user_name : "Unknown"} (ID: ${userId}) is not a registered streamer in Waiter.`);
        if (!silent) {
          await this.bot.channel(source).sendMessage(`You must be a registered streamer to use this command!`, { replyTo: "message_id" in message ? message.message_id : undefined });
        }
        
        return;
      }

      return originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  }
}


/** Decorator for checking if a streamer has linked their Discord account */
export function StreamerHasDiscordLinked(silent: boolean = true) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: ChannelMessage, ...args: any[]
    ) {
      const discordAcc = await getDiscord(source.IAM.id);
      if (!discordAcc) {
        this.logger.debug(`Command is being blocked because streamer ${source.IAM.display_name} (ID: ${source.IAM.id}) does not have a linked Discord account.`);
        if (!silent) {
          await this.bot.channel(source).sendMessage(`${message.broadcaster_user_name} must link their Discord account to Waiter for this command to be available.`, { replyTo: message.message_id });
        }
        return;
      }

      return originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  }
}

/** Decorator for checking if a streamer has linked their Spotify account */
export function StreamerHasSpotifyLinked(silent: boolean = true) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: ChannelMessage, ...args: any[]
    ) {


      const spotifyAcc = await getSpotifyClient(source.waiterUserId);
      if (!spotifyAcc) {
        this.logger.debug(`Command is being blocked because streamer ${source.IAM.display_name} (ID: ${source.IAM.id}) does not have a linked Spotify account.`);
        if (!silent) {
          await this.bot.channel(source).sendMessage(`${message.broadcaster_user_name} must link their Spotify account to Waiter for this command to be available.`, { replyTo: "message_id" in message ? message.message_id : undefined });
        }
        return;
      }

      return originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  }
}