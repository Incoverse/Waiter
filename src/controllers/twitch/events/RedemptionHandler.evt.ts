/*
  * Copyright (c) 2026 Inimi | InimicalPart | Incoverse
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

import CacheManager from "@/lib/cache";
import { hmr } from "@/lib/hmr";
import { extendsClass, findFiles, importLocalModule } from "@/lib/misc";
import type TwitchClient from "@twitch/client";
import chalk from "chalk";
import path from "path";
import WaiterEvent, { type BroadcasterSender, type EventInfo } from "../lib/base/WaiterEvent";
import type { RedemptionInfo } from "../lib/base/WaiterRedemptionTrigger";
import WaiterRedemptionTrigger from "../lib/base/WaiterRedemptionTrigger";
import { ATCategoryType, ATCondition, ATTitleType } from "../lib/base/WaiterReward";
import type { CustomRewardRedemptionAdd, TwitchRedemption } from "../types";


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

  private redemptionTriggers: Set<{
    streamer: TwitchClient;
    trigger: WaiterRedemptionTrigger;
  }> = new Set();

  private redemptionTriggersByFile = new Map<string, WaiterRedemptionTrigger>();
  private setupClients: TwitchClient[] = [];

  private canManageChannelPoints(client: TwitchClient): boolean {
    return client.IAM.broadcaster_type === "affiliate" || client.IAM.broadcaster_type === "partner";
  }

  public override async setup(clients: TwitchClient[], reason: "initial" | "catch-up" | "other" = "initial"): Promise<boolean | null> {
    this.setupClients = clients;

    if (reason === "catch-up") {
      return true;
    }

    const triggerFiles = findFiles(global.isCompiled ? "dist" : "src", /[\/]twitch[\/].*\.rtgr\..s$/);

    const triggers = (await Promise.all(
      triggerFiles
        .map(importLocalModule)        
    ))
      .map((mod) => mod.default)
      .filter((mod) => extendsClass(mod, WaiterRedemptionTrigger)) as (new (bot: TwitchClient) => WaiterRedemptionTrigger)[];


    const streamers = clients.filter(client => !client.isBot);

    this.logger.info(`Found ${triggers.length} trigger(s). Setting up...`);

    const monitizedStreamers = streamers.filter(streamer => {
      if (!this.canManageChannelPoints(streamer)) {
        this.logger.warn(`Streamer ${streamer.IAM.display_name} (ID: ${streamer.IAM.id}) does not have access to channel point rewards and will be skipped for redemption trigger setup.`);
        return false;
      }
      return true;
    });


    // Cache rewards per streamer to avoid fetching them multiple times across triggers
    const rewardsCache = new CacheManager<string, { all: TwitchRedemption[]; manageable: TwitchRedemption[] }>({
      name: "RedemptionRewardsCache",
      logger: this.logger,
      loggingEnabled: true
    });

    const streamStateCache = new CacheManager<string, { isStreamLive: boolean; streamInformation: any }>({
      name: "RedemptionStreamStateCache",
      logger: this.logger,
      loggingEnabled: true
    });

    // Collect all unregister operations to run them in parallel
    const unregisterPromises: Promise<any>[] = [];

    const triggerRoot = "./src/controllers/twitch/triggers";

    const removeTriggerInstance = async (trigger: WaiterRedemptionTrigger, reason: "change" | "remove") => {
      for (const entry of [...this.redemptionTriggers]) {
        if (entry.trigger === trigger) {
          this.redemptionTriggers.delete(entry);
        }
      }

      if (typeof trigger.unload === "function") {
        await trigger.unload(this.setupClients, reason);
      }
    };

    const processTriggerForStreamer = async (instantiatedTrigger: WaiterRedemptionTrigger, streamer: TwitchClient) => {
      const triggerInstalled = instantiatedTrigger.isInstalled(streamer);

      let rewards: TwitchRedemption[] = [];
      let manageableRewards: TwitchRedemption[] = [];
      let isStreamLive = false;
      let streamInformation: any = null;

      const shouldInspectRewards = triggerInstalled || instantiatedTrigger.settings.type === "internal";

      if (!shouldInspectRewards) {
        this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });
        return;
      }

      try {
        const cacheKey = streamer.IAM.id;
        let cachedRewards = rewardsCache.get(cacheKey);

        if (!cachedRewards) {
          const [allRewards, manageableRewardsData] = await Promise.all([
            streamer.getRewards(),
            streamer.getRewards(undefined, true),
          ]);

          cachedRewards = {
            all: allRewards,
            manageable: manageableRewardsData,
          };

          rewardsCache.set(cacheKey, cachedRewards, 120000);
        }

        rewards = cachedRewards.all;
        manageableRewards = cachedRewards.manageable;

        let cachedStreamState = streamStateCache.get(cacheKey);

        if (!cachedStreamState) {
          const [streaming, channelInfo] = await Promise.all([
            streamer.isStreaming(),
            streamer.channel().getChannelInfo(),
          ]);

          cachedStreamState = {
            isStreamLive: streaming,
            streamInformation: channelInfo || null,
          };

          streamStateCache.set(cacheKey, cachedStreamState, 120000);
        }

        isStreamLive = cachedStreamState.isStreamLive;
        streamInformation = cachedStreamState.streamInformation;
      } catch (error: any) {
        if (error?.response?.status === 403) {
          this.logger.warn(`Skipping redemption trigger setup for ${streamer.IAM.display_name} (${streamer.IAM.id}) because Twitch returned 403 for channel point rewards.`);
          return;
        }

        throw error;
      }

      if (!triggerInstalled) {
        if (instantiatedTrigger.settings.type === "internal") {
          const reward = instantiatedTrigger.settings.reward;

          if (!reward) {
            this.logger.error(`Redemption trigger ${instantiatedTrigger.constructor.name} is internal but has no reward set.`);
            return;
          }

          const existing = rewards
            .map((r) => ({
              ...r,
              manageable: manageableRewards.some((m) => m.id === r.id),
            }))
            .find((r) => r.title.toLowerCase() === reward.settings.name.toLowerCase() || !reward.settings.description || r.prompt.toLowerCase() === reward.settings.description.toLowerCase());

          if (existing?.manageable) {
            reward.id = existing.id;
            unregisterPromises.push(reward.unregister(streamer));
          } else if (existing) {
            this.logger.warn(`Redemption trigger ${instantiatedTrigger.constructor.name} exists for ${streamer.IAM.display_name} but is not manageable, so it cannot be deleted.`);
          }
        }

        this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });
        return;
      }

      if (instantiatedTrigger.settings.type === "internal") {
        const reward = instantiatedTrigger.settings.reward;

        if (!reward) {
          this.logger.error(`Redemption trigger ${instantiatedTrigger.constructor.name} is internal but has no reward set.`);
          return;
        }

        const autoToggle = reward.settings.automaticToggle;

        if (autoToggle) {
          if (autoToggle.condition == ATCondition.CATEGORY) {
            const categories = Array.isArray(autoToggle.category) ? autoToggle.category : [autoToggle.category];

            const categoryMode = autoToggle.type ?? ATCategoryType.INCLUDES;
            const categoryMatch = categories.some((category) => {
              return (category.id ? streamInformation?.game_id === category.id : true) && (category.name ? streamInformation?.game_name === category.name : true);
            });

            const shouldBeEnabled = categoryMode === ATCategoryType.INCLUDES ? categoryMatch : !categoryMatch;

            await reward.register(streamer, rewards, manageableRewards, shouldBeEnabled);
          } else if (autoToggle.condition == ATCondition.STREAM_STARTED) {
            await reward.register(streamer, rewards, manageableRewards, isStreamLive);
          } else if (autoToggle.condition == ATCondition.STREAM_ENDED) {
            await reward.register(streamer, rewards, manageableRewards, !isStreamLive);
          } else if (autoToggle.condition == ATCondition.TITLE) {
            const streamTitle = streamInformation.title;

            let shouldBeEnabled = false;

            if (typeof autoToggle.title === "function") {
              shouldBeEnabled = autoToggle.title(streamTitle);
            } else {
              const titles = Array.isArray(autoToggle.title) ? autoToggle.title : [autoToggle.title];
              shouldBeEnabled = titles.some((title) => {
                if (typeof title === "string") {
                  return streamTitle.includes(title);
                } else if (title instanceof RegExp) {
                  return title.test(streamTitle);
                }
                return false;
              });

              const titleType = "type" in autoToggle ? (autoToggle.type ?? ATTitleType.INCLUDES) : ATTitleType.INCLUDES;

              if (titleType === ATTitleType.EXCLUDES) {
                shouldBeEnabled = !shouldBeEnabled;
              }
            }

            await reward.register(streamer, rewards, manageableRewards, shouldBeEnabled);
          } else if (autoToggle.condition == ATCondition.MANAGER_CONNECTED) {
            const isManagerConnected = global.manager?.clients?.values().some((client) => client.waiterUserId === streamer.waiterUserId) ?? false;

            await reward.register(streamer, rewards, manageableRewards, isManagerConnected);
          } else if (autoToggle.condition == ATCondition.MANAGER_DISCONNECTED) {
            const isManagerDisconnected = !global.manager?.clients?.values().some((client) => client.waiterUserId === streamer.waiterUserId);

            await reward.register(streamer, rewards, manageableRewards, isManagerDisconnected);
          }
        } else {
          await reward.register(streamer, rewards, manageableRewards);
        }
      }

      this.redemptionTriggers.add({ streamer, trigger: instantiatedTrigger });
    };

    const syncTriggerInstance = async (Trigger: new (bot: TwitchClient) => WaiterRedemptionTrigger, filePath: string) => {
      const instantiatedTrigger = new Trigger(this.bot);

      const setupResult = await instantiatedTrigger.setup(clients);

      if (setupResult === false) {
        this.logger.error(`Failed to setup redemption trigger: ${Trigger.name}`);
        return null;
      } else if (setupResult === null) {
        return null;
      }

      this.redemptionTriggersByFile.set(filePath, instantiatedTrigger);

      for (const streamer of monitizedStreamers) {
        await processTriggerForStreamer(instantiatedTrigger, streamer);
      }

      return instantiatedTrigger;
    };

    for (const index in triggers) {
      const Trigger = triggers[index];

      if (!Trigger) {
        this.logger.warn(`Failed to load redemption trigger from file ${triggerFiles[index]}. Skipping.`);
        continue;
      }

      await syncTriggerInstance(Trigger, triggerFiles[index]);
    }

    if (global.config.hotReload.enabled && !global.isCompiled) {
      hmr.setupHMR({
        root: triggerRoot,
        filter: (file) => {
          return /\.rtgr\..s$/.test(file);
        },

        events: {
          typeError: (file, errors) => {
            this.logger.warn(`Failed to hot-reload redemption trigger from ${path.relative(triggerRoot, file)} due to ${errors.length} validation error(s):`);
            errors.forEach((error) => {
              this.logger.warn(`  - ${path.relative(triggerRoot, file)}:${error.line}:${error.column} - TS${error.code}: ${error.message}`);
            });
          },

          add: async (file, mod) => {
            if (!mod.default) return;

            const Trigger = mod.default;
            if (!extendsClass(Trigger, WaiterRedemptionTrigger)) return;

            const relativeFile = path.relative(triggerRoot, file);
            const triggerInstance = await syncTriggerInstance(Trigger, file);

            if (!triggerInstance) {
              this.logger.warn(`Failed to setup hot-reloaded redemption trigger ${chalk.bold(Trigger.name)} from file ${relativeFile}.`);
              return;
            }

            this.logger.info(`Loaded new redemption trigger from ${relativeFile}: ${chalk.bold(Trigger.name)}`);
          },

          change: async (file, mod) => {
            const oldTrigger = this.redemptionTriggersByFile.get(file);
            if (oldTrigger) {
              await removeTriggerInstance(oldTrigger, "change");
            }
            this.redemptionTriggersByFile.delete(file);

            if (!mod.default) return;
            const Trigger = mod.default;
            if (!extendsClass(Trigger, WaiterRedemptionTrigger)) return;

            const relativeFile = path.relative(triggerRoot, file);
            const triggerInstance = await syncTriggerInstance(Trigger, file);

            if (!triggerInstance) {
              this.logger.warn(`Failed to setup hot-reloaded redemption trigger ${chalk.bold(Trigger.name)} from file ${relativeFile}.`);
              return;
            }

            this.logger.info(`Reloaded redemption trigger from ${relativeFile}: ${chalk.bold(Trigger.name)}`);
          },

          remove: async (file) => {
            const trigger = this.redemptionTriggersByFile.get(file);
            if (trigger) {
              await removeTriggerInstance(trigger, "remove");
            }
            this.redemptionTriggersByFile.delete(file);

            const relativeFile = path.relative(triggerRoot, file);
            this.logger.info(`Removed redemption trigger from ${relativeFile}`);
          },

          rename: (oldFile, newFile) => {
            const trigger = this.redemptionTriggersByFile.get(oldFile);
            if (trigger) {
              this.redemptionTriggersByFile.delete(oldFile);
              this.redemptionTriggersByFile.set(newFile, trigger);
            }

            const relativeOldFile = path.relative(triggerRoot, oldFile);
            const relativeNewFile = path.relative(triggerRoot, newFile);
            this.logger.info(`Redemption trigger file renamed from ${relativeOldFile} to ${relativeNewFile}`);
          },
        },

        validate: async (file, mod) => {
          if (!mod.default) {
            return {
              success: false,
              reason: "Missing default export",
            };
          }

          const Trigger = mod.default;

          const extendsTrigger = extendsClass(Trigger, WaiterRedemptionTrigger);
          if (!extendsTrigger) {
            return {
              success: false,
              reason: "Class must extend WaiterRedemptionTrigger",
            };
          }

          return { success: true };
        },
      });
    }

    // Execute all unregister operations in parallel
    await Promise.all(unregisterPromises);

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
    for (const { streamer, trigger } of this.redemptionTriggers) {

      if (source.IAM.id !== streamer.IAM.id) continue; // Only execute triggers for the streamer the redemption belongs to

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