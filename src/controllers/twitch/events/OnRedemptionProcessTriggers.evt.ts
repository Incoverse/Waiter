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

import { extendsClass, getAllModules, importLocalModule } from "@/lib/misc";
import type TwitchClient from "../client";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { RedemptionInfo } from "../lib/base/WaiterRedemptionTrigger";
import WaiterRedemptionTrigger from "../lib/base/WaiterRedemptionTrigger";
import type { CustomRewardRedemptionAdd } from "../types";


export default class ORPT extends WaiterEvent {
  public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Twitch:event",
      event: {
          as: "broadcaster",
          name: "channel.channel_points_custom_reward_redemption.add",
          version: 1,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id,
          }
      }
  })

  private redemptionTriggers: WaiterRedemptionTrigger[] = [];

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
          const triggers = (await Promise.all(
            (await getAllModules(".", /controllers\/twitch\/.*\.rtgr\..s$/)).map(importLocalModule)        
          ))
            .map((mod) => mod.default)
            .filter((mod) => extendsClass(mod, WaiterRedemptionTrigger)) as (new (bot: TwitchClient) => WaiterRedemptionTrigger)[];
      
          this.logger.info(`Found ${triggers.length} trigger(s). Setting up...`);
      
          for (const rtgr of triggers) {
            const triggerInstance = new rtgr(this.bot);
            const setupResult = await triggerInstance.setup([this.bot, ...global.twitch.streamers.values()]);
      
            if (setupResult === false) {
              this.logger.warn(`Failed to setup trigger ${rtgr.name}. Skipping.`);
              continue;
            } else if (setupResult === null) {
              continue
            }
      
            this.redemptionTriggers.push(triggerInstance);
          }
      
          return super.setup(clients);
  }

  // @ts-expect-error (TS2416) - Method overloads with different parameters (Twitch:event has source and data, onStart has clients array)
  public async exec(source: TwitchClient, data: CustomRewardRedemptionAdd): Promise<void> {

    const streamer = global.twitch.streamers.get(data.event.broadcaster_user_id);
    if (!streamer) {
      this.logger.warn(`Received redemption event for unregistered streamer with ID ${data.event.broadcaster_user_id}. Ignoring.`);
      return;
    }

    const forExec: RedemptionInfo = {
      reward_id: data.event.reward.id,
      redeemer: {
        id: data.event.user_id,
        display_name: data.event.user_name,
        login: data.event.user_login,
      },
      redemption: {
        id: data.event.id,
        title: data.event.reward.title,
        cost: data.event.reward.cost,
        prompt: data.event.reward.prompt,
        status: data.event.status.toUpperCase() as "FULFILLED" | "UNFULFILLED" | "CANCELED",
        user_input: data.event.user_input ?? null, //? Only available if the reward requires input
      },
      redeemed_at: data.event.redeemed_at,
    }
    for (const trigger of this.redemptionTriggers) {
      if (trigger.redemptionTrigger instanceof RegExp && trigger.redemptionTrigger.test(data.event.reward.title)) {
        this.logger.log(`[${streamer?.IAM?.login ?? "Unknown"}] Redemption trigger triggered:`, trigger.constructor.name, data.event.reward.title);
        trigger.exec(streamer, forExec);
      } else if (typeof trigger.redemptionTrigger === "function") {
        trigger.redemptionTrigger({
          redemption_id: data.event.id,
          reward_id: data.event.reward.id,
          title: data.event.reward.title,
          cost: data.event.reward.cost,
          prompt: data.event.reward.prompt,
          input: data.event.user_input ?? null,
        }).then((result) => {
          if (result) {
            this.logger.log(`[${streamer?.IAM?.login ?? "Unknown"}] Redemption trigger triggered:`, trigger.constructor.name, data.event.reward.title);
            trigger.exec(streamer, forExec);
          }
        })
      }
    }
    return;
  } 
}