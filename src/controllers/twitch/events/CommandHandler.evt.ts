import { extendsClass, getAllModules, importLocalModule } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterCommand from "@twitch/lib/base/WaiterCommand";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { ChannelChatMessage } from "../types";

export default class TCMD extends WaiterEvent {
  public override eventTrigger: (params: BroadcasterSender) => EventInfo = ({ sender, broadcaster }) => ({
    type: "Twitch:event",
    event: {
      as: "sender",
      name: "channel.chat.message",
      version: 1,
      condition: { "user_id": sender?.IAM?.id, broadcaster_user_id: broadcaster?.IAM?.id },
    },
  });

  private commands: WaiterCommand[] = [];

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
    const commands = (await Promise.all(
      (await getAllModules(".", /controllers\/twitch\/.*\.cmd\..s$/)).map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterCommand)) as (new (bot: TwitchClient) => WaiterCommand)[];

    this.logger.info(`Found ${commands.length} command(s). Setting up...`);

    for (const cmd of commands) {
      const commandInstance = new cmd(this.bot);
      const setupResult = await commandInstance.setup([this.bot, ...global.twitch.streamers.values()]);

      if (setupResult === false) {
        this.logger.warn(`Failed to setup command ${cmd.name}. Skipping.`);
        continue;
      } else if (setupResult === null) {
        continue
      }

      this.commands.push(commandInstance);
    }

    return super.setup(clients);

  }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public override async exec(source: TwitchClient, data: ChannelChatMessage): Promise<void> {


    const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);

    if (!streamer) {
      this.logger.warn(`Received event for unregistered streamer with ID ${source.IAM.id}. Ignoring.`);
      return;
    }

    for (const command of this.commands) {
      if (command.messageTrigger instanceof RegExp && command.messageTrigger.test(data.event.message.text)) {
        if (data.event.chatter_user_id === source.IAM.id && !command.settings.allowSelf) {
          return;
        }
        this.logger.debug(`Command triggered: ${command.constructor.name} - ${data.event.message.text}`);
        command.exec(streamer, data.event);
      } else if (typeof command.messageTrigger === "function") {
        command.messageTrigger(data.event).then((result) => {
          if (data.event.chatter_user_id === source.IAM.id && !command.settings.allowSelf) {
            return;
          }

          if (result) {
            this.logger.debug(`Command triggered: ${command.constructor.name} - ${data.event.message.text}`);
            command.exec(streamer, data.event);
          }
        })
      }
    }
  }
}