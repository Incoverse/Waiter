import type TwitchClient from "@twitch/client";
import type WaiterCommand from "./base/WaiterCommand";
import type { ChannelMessage, Message } from "./base/WaiterCommand";

export function StreamerIsLive(silent: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: ChannelMessage, ...args: any[]
    ) {
      if (!global.twitch.streamerData[source.IAM.id]?.isStreaming) {
        if (!silent) {
          await this.bot.withChannel(source).sendMessage(`This command can only be used while the stream is live!`, { replyTo: message.message_id });
        }
        return;
      }

      await originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  };
}

export function UserIsRegisteredStreamer(silent: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: Message, ...args: any[]
    ) {

      const userId = "chatter_user_id" in message ? message.chatter_user_id : message.from_user_id;

      if (!userId || !global.twitch.streamerData[userId]) {
        if (!silent) {
          await this.bot.withChannel(source).sendMessage(`You must be a registered streamer to use this command!`, { replyTo: "message_id" in message ? message.message_id : undefined });
        }
        
        return;
      }

      await originalMethod.apply(this, [source, message, ...args]);
    };

    return descriptor;
  }
}