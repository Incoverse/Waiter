import type TwitchClient from "@twitch/client";
import type WaiterCommand from "./base/WaiterCommand";
import type { Message } from "./base/WaiterCommand";

export function StreamerIsLive(silent: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (
      this: WaiterCommand,
      source: TwitchClient, message: Message, ...args: any[]
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