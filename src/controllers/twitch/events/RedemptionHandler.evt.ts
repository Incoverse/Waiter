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

import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { RedemptionInfo } from "../lib/base/WaiterRedemptionTrigger";
import WaiterRedemptionTrigger from "../lib/base/WaiterRedemptionTrigger";
import { ATCategoryType, ATCondition, ATTitleType } from "../lib/base/WaiterReward";
import type { CustomRewardRedemptionAdd } from "../types";


export default class TRED extends WaiterEvent {
  public eventTrigger: (params: BroadcasterSender) => EventInfo = ({broadcaster, sender}) => ({
      type: "Twitch:event",
      event: {
          as: "broadcaster",
          name: "channel.channel_points_custom_reward_redemption.add",
          version: 1,
          condition: {
              "broadcaster_user_id": broadcaster?.IAM?.id ?? "NONE",
          }
      }
  })

  private redemptionTriggers: WaiterRedemptionTrigger[] = [];

  public override async setup(clients: TwitchClient[]): Promise<boolean | null> {
    const triggers = (await Promise.all(
      findFiles(global.isCompiled ? "dist" : "src", /\/twitch\/.*\.rtgr\..s$/)
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterRedemptionTrigger)) as (new (bot: TwitchClient) => WaiterRedemptionTrigger)[];


    const streamers = clients.filter(client => !client.isBot);

    this.logger.info(`Found ${triggers.length} trigger(s). Setting up...`);

    for (const trigger of triggers) {
      const instantiatedTrigger = new trigger(this.bot);

      const setupResult = await instantiatedTrigger.setup(clients);

      if (setupResult === false) {
          this.logger.error(`Failed to setup redemption trigger: ${trigger.name}`);
          continue;
      } else if (setupResult === null) {
          continue;
      }
      
      
      for (const streamer of streamers) {
        const rewards = await streamer.getRewards();
        const manageableRewards = await streamer.getRewards(undefined, true)
  
        const isStreamLive = await streamer.isStreaming();
        const streamInformation = await streamer.channel().getChannelInfo() || null;


          if (instantiatedTrigger.settings.type === "internal") {
              if (!instantiatedTrigger.settings.reward) {
                  this.logger.error(`Redemption trigger ${trigger.name} is internal but has no reward set.`);
                  continue;
              }

              const reward = instantiatedTrigger.settings.reward


              const autoToggle = reward.settings.automaticToggle;

              if (autoToggle) {
                  if (autoToggle.condition == ATCondition.CATEGORY) {
                      const categories = Array.isArray(autoToggle.category) ? autoToggle.category : [autoToggle.category];


                      const categoryMode = autoToggle.type ?? ATCategoryType.INCLUDES;
                      const categoryMatch = categories.some(category => {
                          return (category.id ? streamInformation?.game_id === category.id : true) && (category.name ? streamInformation?.game_name === category.name : true);
                      })

                      const shouldBeEnabled = categoryMode === ATCategoryType.INCLUDES ? categoryMatch : !categoryMatch;

                      await reward.register(streamer, rewards, manageableRewards, shouldBeEnabled);
                  } else if (autoToggle.condition == ATCondition.STREAM_STARTED) {
                      await reward.register(streamer, rewards, manageableRewards, isStreamLive);
                  } else if (autoToggle.condition == ATCondition.STREAM_ENDED) {
                      await reward.register(streamer, rewards, manageableRewards, !isStreamLive);
                  } else if (autoToggle.condition == ATCondition.TITLE) {
                      const streamTitle = streamInformation.title

                      let shouldBeEnabled = false;

                      if (typeof autoToggle.title === "function") {
                          shouldBeEnabled = autoToggle.title(streamTitle);
                      } else {
                          const titles = Array.isArray(autoToggle.title) ? autoToggle.title : [autoToggle.title];
                          shouldBeEnabled = titles.some(title => {
                              if (typeof title === "string") {
                                  return streamTitle.includes(title);
                              } else if (title instanceof RegExp) {
                                  return title.test(streamTitle);
                              }
                              return false;
                          })

                          // Only access type if it exists on autoToggle
                          const titleType = "type" in autoToggle ? (autoToggle.type ?? ATTitleType.INCLUDES) : ATTitleType.INCLUDES;

                          if (titleType === ATTitleType.EXCLUDES) {
                              shouldBeEnabled = !shouldBeEnabled;
                          }
                      }

                      await reward.register(streamer, rewards, manageableRewards, shouldBeEnabled);
                  }
              } else {
                  await reward.register(streamer, rewards, manageableRewards);
              }
          }

          this.redemptionTriggers.push(instantiatedTrigger);
      }

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
      if (trigger.settings.type == "external") {
        if (trigger.settings.trigger instanceof RegExp && trigger.settings.trigger.test(data.event.reward.title)) {
          this.logger.withPrefix(`[${streamer.IAM.login}] - ${trigger.constructor.name}`).log("Redemption trigger was triggered by", data.event.user_name);
          trigger.exec(streamer,forExec);
        } else if (typeof trigger.settings.trigger === "function") {
          trigger.settings.trigger({
            redemption_id: data.event.id,
            reward_id: data.event.reward.id,
            title: data.event.reward.title,
            cost: data.event.reward.cost,
            prompt: data.event.reward.prompt,
            input: data.event.user_input ?? null,
          }).then((result) => {
            if (result) trigger.exec(streamer, forExec);
          })
        }
      } else {
        if (trigger.settings.reward.id === data.event.reward.id) {
          this.logger.withPrefix(`[${streamer.IAM.login} - ${trigger.constructor.name}]`).log("Redemption trigger was triggered by", data.event.user_name);
          trigger.settings.reward.triggerEvent(streamer, data.event);
          trigger.exec(streamer, forExec);
        }
      }
    }
    return;
  } 
}