import type TwitchClient from "@twitch/client";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { UserWhisperMessage } from "../types";

export default class OWTBR extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "user.whisper.message",
      version: 1,
      condition: { "user_id": sender?.IAM?.id },
    },
  });

  // public override registerTwitchEvents({ broadcaster }: BroadcasterSender): TwitchEventInfo[] {
  //     return [
  //       {
  //         as: "broadcaster",
  //         name: "user.whisper.message",
  //         version: 1,
  //         condition: {
  //           user_id: broadcaster?.IAM?.id
  //         },
  //       }
  //     ]
  // }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: UserWhisperMessage): Promise<void> {
    this.logger.info(`${source.IAM.display_name} (${source.isBot ? "BOT" : "STREAMER"}) received a whisper:`, data.event.whisper.text);

    const fromUserIsStreamer = global.twitch.streamers.has(data.event.from_user_id);

    if (fromUserIsStreamer) {
      await source.sendWhisper(data.event.from_user_id, `Hello ${data.event.from_user_name}. Waiter recognizes you as a streamer added to Waiter.`).catch((err) => {
        this.logger.warn("Error sending whisper response:", err);
      });
    } else {
      await source.sendWhisper(data.event.from_user_id, `Hello ${data.event.from_user_name}. Waiter recognizes you as a viewer. If you are a streamer and want to use Waiter, please ask the channel owner to add you to Waiter.`).catch((err) => {
        this.logger.warn("Error sending whisper response:", err);
      });
    }
  }
}