import CacheManager from "@/lib/cache";
import { parseDuration } from "@/lib/misc";
import chalk from "chalk";
import type TwitchClient from "../../client";
import type { CustomRewardRedemptionAdd, TwitchRedemption } from "../../types";

const defaultSettings: Omit<RewardSettings, 'name' | 'price'> = {
    enabledByDefault: true,
    priceIncrease: null,
    cooldown: null,
    inputRequired: false,
    redemptionLimit: null,
    description: null,
    unregisterOnSessionEnd: true,
}


export default class WaiterReward {

    public settings: RewardSettings;
    public cache: CacheManager = new CacheManager();
    public logger: Console;

    public id: string | null = null; // Will be set by the manager
    private idsByStreamer = new Map<string, string>();

    public getId(streamer: TwitchClient): string | null {
        return this.idsByStreamer.get(streamer.IAM.id) ?? this.id;
    }

    private setId(streamer: TwitchClient, id: string) {
        this.idsByStreamer.set(streamer.IAM.id, id);
        this.id = id;
    }

    private canUseChannelPoints(streamer: TwitchClient, action: string): boolean {
        if (["affiliate", "partner"].includes(streamer.IAM.broadcaster_type)) {
            return true;
        }

        streamer.logger.warn(`Skipping channel point ${action} for reward "${this.settings.name}" because ${streamer.IAM.display_name} is not an affiliate or partner`);
        return false;
    }

    public async enabled(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "enabled-state check")) {
            return false;
        }

        if (this.cache.has(`${streamer.IAM.id}-enabled`)) {
            return this.cache.get(`${streamer.IAM.id}-enabled`);
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot get enabled state of reward "${this.settings.name}" because it has no ID`);
            return false;
        }
        return await streamer.getRewards(rewardId).then((rewards) => {
            const reward = rewards.find((r) => r.id === rewardId);
            if (!reward) {
                streamer.logger.error(`Reward with ID "${rewardId}" not found when getting enabled state of reward "${this.settings.name}"`);
                return false;
            }

            this.cache.set(`${streamer.IAM.id}-enabled`, reward.is_enabled, 60000);

            return reward.is_enabled;
        }).catch((error) => {
            streamer.logger.error(`Failed to get enabled state of reward "${this.settings.name}": ${error.message}`);
        });
    }

    public currentPrice: number = 0; // Will be set by the manager, used for price increase calculations


    constructor(settings: RewardSettings) {
        this.settings = {
            ...defaultSettings,
            ...settings,
        };

        this.logger = console.withSender(chalk.hex("#8956FB")(this.constructor.name)); 
        this.cache.setLogger(this.logger);

        this.currentPrice = this.settings.price;
    }

    public async triggerEvent(streamer: TwitchClient, redemption: CustomRewardRedemptionAdd["event"]): Promise<void> {
        if (this.settings.priceIncrease) {
            const equation = this.settings.priceIncrease.equation.replace(/price/g, this.currentPrice.toString());
            await this.modifyPrice(streamer, eval(equation));
        }
    }

    public async modifyPrice(streamer: TwitchClient,price: number): Promise<boolean> {
        if (!this.canUseChannelPoints(streamer, "price update")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot modify price of reward "${this.settings.name}" because it has no ID`);
            return false;
        }
        return streamer.updateReward(rewardId, { cost: price }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" price modified to ${price}`);
            this.currentPrice = price;
            return true;
        }).catch((error) => {
            streamer.logger.error(`Failed to modify price of reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }

    public async register(streamer: TwitchClient, redemptions?: TwitchRedemption[], manageableRewards?: TwitchRedemption[], overridenEnabled?: boolean): Promise<boolean> {
        if (!this.canUseChannelPoints(streamer, "registration")) {
            return false;
        }

        global.twitch.communication.on("stream.offline", async (streamer, data) => {

            if (this.settings.automaticToggle?.condition === ATCondition.STREAM_ENDED) {
                if (!this.enabled) {
                    await this.enable(streamer);
                }
            }

            if (!data.beforeStart && this.settings.priceIncrease?.consistency === "stream") {
                await this.modifyPrice(streamer, this.settings.price);
            }
        });

        global.twitch.communication.on("stream.online", async (streamer, data) => {

            if (this.settings.automaticToggle?.condition === ATCondition.STREAM_STARTED) {
                if (!this.enabled) {
                    await this.enable(streamer);
                }
            }

            if (this.settings.priceIncrease?.consistency === "stream") {
                await this.modifyPrice(streamer,this.settings.price);
            }
        });

        global.twitch.communication.on("stream.change", async (streamer, data) => {
            const changes: { [key: string]: { old: any, new: any } } = data.changes;

            if (changes.game_id && changes.game_name) {
                if (this.settings.automaticToggle?.condition === "category" && this.settings.automaticToggle.category) {
                    const categories = Array.isArray(this.settings.automaticToggle.category) ? this.settings.automaticToggle.category : [this.settings.automaticToggle.category];
                    // check if the new game matches the category condition, if both id and name are provided, check both, else only the one that is provided
                    const matches = categories.some((cat) => {
                        if (cat.id && cat.name) {
                            return (cat.id === changes.game_id!.new || cat.name === changes.game_name!.new);
                        } else if (cat.id) {
                            return cat.id === changes.game_id!.new;
                        } else if (cat.name) {
                            return cat.name === changes.game_name!.new;
                        }
                        return false;
                    });

                    streamer.logger.debug(`Automatic toggle condition for category matched: ${matches}`);

                    if (matches) {
                        if (!(await this.enabled(streamer))) {
                            await this.enable(streamer);
                        }
                    } else {
                        if (await this.enabled(streamer)) {
                            await this.disable(streamer);
                        }
                    }
                } else if (this.settings.automaticToggle?.condition === "title" && this.settings.automaticToggle.title) {
                    const title = changes.title ? changes.title.new : null;
                    if (title) {
                        let matches = false;
                        const toggleTitle = Array.isArray(this.settings.automaticToggle.title) ? this.settings.automaticToggle.title : [this.settings.automaticToggle.title];
                        for (const t of toggleTitle) {
                            if (typeof t === "string") {
                                matches = title.includes(t);
                            } else if (t instanceof RegExp) {
                                matches = t.test(title);
                            } else if (typeof t === "function") {
                                matches = t(title);
                            }
                            if (matches) break;
                        }

                        streamer.logger.debug(`Automatic toggle condition for title matched: ${matches}`);

                        if (matches) {
                            if (!(await this.enabled(streamer))) {
                                await this.enable(streamer);
                            }
                        } else {
                            if (await this.enabled(streamer)) {
                                await this.disable(streamer);
                            }
                        }
                    }
                }
            }
        })

        const attachManagerListeners = (() => {
            const managerCommunication = global.manager?.communication;

            if (!managerCommunication) {
                return false;
            }

            managerCommunication.on("manager.client_connected", async (data) => {
                if (this.settings.automaticToggle?.condition === "manager_connected") {
                    if (data.wuid === streamer.waiterUserId) {
                        if (!(await this.enabled(streamer))) {
                            await this.enable(streamer);
                        }
                    }
                } else if (this.settings.automaticToggle?.condition === "manager_disconnected") {
                    if (data.wuid === streamer.waiterUserId) {
                        if (await this.enabled(streamer)) {
                            await this.disable(streamer);
                        }
                    }
                }
            });

            managerCommunication.on("manager.client_disconnected", async (data) => {
                if (this.settings.automaticToggle?.condition === "manager_connected") {
                    if (data.wuid === streamer.waiterUserId) {
                        if (await this.enabled(streamer)) {
                            await this.disable(streamer);
                        }
                    }
                } else if (this.settings.automaticToggle?.condition === "manager_disconnected") {
                    if (data.wuid === streamer.waiterUserId) {
                        if (!(await this.enabled(streamer))) {
                            await this.enable(streamer);
                        }
                    }
                }
            });

            return true;
        }).bind(this);

        if (!attachManagerListeners()) {
            const managerListenerInterval = setInterval(() => {
                if (attachManagerListeners()) {
                    clearInterval(managerListenerInterval);
                }
            }, 1000);
        }


        if (!redemptions) {
            redemptions = await streamer.getRewards();
        }
        if (!manageableRewards) {
            manageableRewards = await streamer.getRewards(undefined, true);
        }

        const existing = redemptions.map((r) => {
            return {
                ...r,
                manageable: manageableRewards.some((m) => m.id === r.id)
            }
        }).find((r) => r.title.toLowerCase() === this.settings.name.toLowerCase() || !this.settings.description || r.prompt.toLowerCase() === this.settings.description.toLowerCase())

        if (existing) {
            if (existing.manageable) {
                this.id = existing.id;
                streamer.logger.withPrefix(`[${streamer.IAM.login}]`).debug(`Reward "${this.settings.name}" already exists, using existing ID: ${this.id}`);
                const rewardId = existing.id;

                let needsUpdate =
                    this.settings.name !== existing.title ||
                    this.settings.description !== existing.prompt ||
                    this.settings.price !== existing.cost ||
                    (overridenEnabled ?? this.settings.enabledByDefault) !== existing.is_enabled ||
                    (this.settings.backgroundColor && this.settings.backgroundColor !== existing.background_color) ||
                    this.settings.inputRequired !== existing.is_user_input_required ||
                    (
                        (this.settings.cooldown == null && existing.global_cooldown_setting.global_cooldown_seconds !== 0) ||
                        (this.settings.cooldown != null &&
                            Math.floor(parseDuration(this.settings.cooldown) / 1000) !== existing.global_cooldown_setting.global_cooldown_seconds)
                    ) ||
                    (
                        (this.settings.redemptionLimit?.perStream == null && existing.max_per_stream_setting.max_per_stream !== 0) ||
                        (this.settings.redemptionLimit?.perStream != null &&
                            this.settings.redemptionLimit.perStream !== existing.max_per_stream_setting.max_per_stream)
                    ) ||
                    (
                        (this.settings.redemptionLimit?.perUser == null && existing.max_per_user_per_stream_setting.max_per_user_per_stream !== 0) ||
                        (this.settings.redemptionLimit?.perUser != null &&
                            this.settings.redemptionLimit.perUser !== existing.max_per_user_per_stream_setting.max_per_user_per_stream)
                    );
                if (needsUpdate) {
                    const updatePayload: Record<string, any> = {};

                    if (this.settings.name !== existing.title) {
                        updatePayload.title = this.settings.name;
                    }
                    if (this.settings.description !== existing.prompt) {
                        updatePayload.prompt = this.settings.description || "";
                    }
                    if (this.settings.price !== existing.cost) {
                        updatePayload.cost = this.settings.price;
                    }
                    if ((overridenEnabled ?? this.settings.enabledByDefault) !== existing.is_enabled) {
                        updatePayload.is_enabled = overridenEnabled ?? this.settings.enabledByDefault;
                    }
                    if (this.settings.backgroundColor !== existing.background_color) {
                        updatePayload.background_color = this.settings.backgroundColor || undefined;
                    }
                    if (this.settings.inputRequired !== existing.is_user_input_required) {
                        updatePayload.is_user_input_required = this.settings.inputRequired;
                    }
                    // Cooldown
                    const cooldownSeconds = this.settings.cooldown != null ? Math.floor(parseDuration(this.settings.cooldown) / 1000) : null;
                    if (
                        (this.settings.cooldown == null && existing.global_cooldown_setting.global_cooldown_seconds !== 0) ||
                        (this.settings.cooldown != null && cooldownSeconds !== existing.global_cooldown_setting.global_cooldown_seconds)
                    ) {
                        updatePayload.is_global_cooldown_enabled = this.settings.cooldown != null;
                        updatePayload.global_cooldown_seconds = cooldownSeconds || null;
                    }
                    // Per Stream Limit
                    if (
                        (this.settings.redemptionLimit?.perStream == null && existing.max_per_stream_setting.max_per_stream !== 0) ||
                        (this.settings.redemptionLimit?.perStream != null && this.settings.redemptionLimit.perStream !== existing.max_per_stream_setting.max_per_stream)
                    ) {
                        updatePayload.is_max_per_stream_enabled = this.settings.redemptionLimit?.perStream != null;
                        updatePayload.max_per_stream = this.settings.redemptionLimit?.perStream || null;
                    }
                    // Per User Limit
                    if (
                        (this.settings.redemptionLimit?.perUser == null && existing.max_per_user_per_stream_setting.max_per_user_per_stream !== 0) ||
                        (this.settings.redemptionLimit?.perUser != null && this.settings.redemptionLimit.perUser !== existing.max_per_user_per_stream_setting.max_per_user_per_stream)
                    ) {
                        updatePayload.is_max_per_user_per_stream_enabled = this.settings.redemptionLimit?.perUser != null;
                        updatePayload.max_per_user_per_stream = this.settings.redemptionLimit?.perUser || null;
                    }
                    await streamer.updateReward(rewardId, updatePayload);
                    streamer.logger.debug(`Reward "${this.settings.name}" updated to match settings`);
                }
                this.setId(streamer, rewardId);
                return true;
            } else {
                streamer.logger.error(`Reward "${this.settings.name}" already exists but is not manageable, cannot register`);
                return false;
            }
        }

        const hasCooldown = !!this.settings.cooldown
        return await streamer.createReward({
            title: this.settings.name,
            cost: this.settings.price,
            prompt: this.settings.description || "",
            is_enabled: overridenEnabled ?? this.settings.enabledByDefault,
            background_color: this.settings.backgroundColor || undefined,
            is_user_input_required: this.settings.inputRequired,
            is_global_cooldown_enabled: hasCooldown,
            global_cooldown_seconds: hasCooldown ? Math.floor(parseDuration(this.settings.cooldown!) / 1000) : undefined,
            max_per_stream: this.settings.redemptionLimit?.perStream || undefined,
            max_per_user_per_stream: this.settings.redemptionLimit?.perUser || undefined,
        }).then((reward) => {
            streamer.logger.debug(`Reward "${this.settings.name}" registered with ID: ${reward.id}`);
            this.setId(streamer, reward.id);
            this.cache.set(`${streamer.IAM.id}-enabled`, reward.is_enabled, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping reward registration for "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to register reward "${this.settings.name}": ${error.message}`);
            return false;
        })
    }
    public async unregister(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "unregistration")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot unregister reward "${this.settings.name}" because it has no ID`);
            return false
        }
        return streamer.deleteReward(rewardId).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" unregistered successfully`);
            this.idsByStreamer.delete(streamer.IAM.id);
            if (this.idsByStreamer.size === 0) {
                this.id = null;
            }
            this.cache.delete(`${streamer.IAM.id}-enabled`);

            return true;
        }).catch((error) => {
            streamer.logger.error(`Failed to unregister reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }
    public async enable(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "enable")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot enable reward "${this.settings.name}" because it has no ID`);
            return false;
        }

        if (await this.enabled(streamer)) {
            streamer.logger.debug(`Reward "${this.settings.name}" is already enabled`);
            return true; // Already enabled, no action needed
        }

        return streamer.updateReward(rewardId, { is_enabled: true }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" enabled successfully`);
            this.cache.set(`${streamer.IAM.id}-enabled`, true, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping enable for reward "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to enable reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }
    public async disable(streamer: TwitchClient) {
        if (!this.canUseChannelPoints(streamer, "disable")) {
            return false;
        }

        const rewardId = this.getId(streamer);

        if (!rewardId) {
            streamer.logger.error(`Cannot disable reward "${this.settings.name}" because it has no ID`);
            return false;
        }

        return streamer.updateReward(rewardId, { is_enabled: false }).then(() => {
            streamer.logger.debug(`Reward "${this.settings.name}" disabled successfully`);
            this.cache.set(`${streamer.IAM.id}-enabled`, false, 60000);
            return true;
        }).catch((error) => {
            if (error?.response?.status === 403 || error?.response?.status === 404) {
                streamer.logger.debug(`Skipping disable for reward "${this.settings.name}" on ${streamer.IAM.display_name} because it is unavailable (${error.response.status})`);
                return false;
            }
            streamer.logger.error(`Failed to disable reward "${this.settings.name}": ${error.message}`);
            return false;
        });
    }


}

export type RewardSettings = {
    /**
     * The cooldown period for the reward (e.g. "1m", "30s").
     */
    cooldown?: string | null;

    /**
     * Limits for reward redemption, including per stream and per user.
     */
    redemptionLimit?: {
        /**
         * Maximum number of redemptions per stream.
         */
        perStream?: number | null;

        /**
         * Maximum number of redemptions per user.
         */
        perUser?: number | null;
    } | null;

    /**
     * The price of the reward (e.g. 1000).
     */
    price: number;

    /**
     * The background color for the reward (e.g. "#FF0000").
     */
    backgroundColor?: string | null;

    /**
     * Configuration for price increase.
     */
    priceIncrease?: {
        /**
         * The equation used to calculate the new price (e.g. "price + 100").
         */
        equation: string;

        /**
         * Determines how price increases are persisted: "stream", or "none".
         */
        consistency: "stream" | "none";
    } | null;

    /**
     * Whether the reward is enabled by default.
     * 
     * This option is overridden by the automaticToggle setting. If the condition for automaticToggle is met, the reward will be enabled regardless of this setting, if not it will be disabled.
     */
    enabledByDefault: boolean;

    /**
     * The name of the reward (e.g. "Hydrate").
     */
    name: string;

    /**
     * A description of the reward (e.g. "Make Inimi hydrate").
     */
    description?: string | null;

    /**
     * Whether user input is required to redeem the reward.
     */
    inputRequired?: boolean;

    /**
     * Whether the reward should be unregistered when the session ends.
     * If true, the reward will be automatically unregistered when the session ends.
     * If false, the reward will remain registered even after the session ends.
     */
    unregisterOnSessionEnd?: boolean;

    /**
     * Automatic toggle configuration.
     * Either one of these must be defined if `automaticToggle` is present.
     */
    automaticToggle?: 
    | {
        /**
         * This reward will be automatically toggled on if the category matches, and off when it doesn't match.
         */
        condition: ATCondition.CATEGORY;
        /**
         * The category or categories to match against.
         * Can be a single category or an array of categories.
         */
        category: ATCategory | ATCategory[];
        /**
         * The type of category matching to use.
         * If not specified, defaults to `ATCategoryType.INCLUDES`.
         */
        type?: ATCategoryType;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream starts, and off when the stream ends.
         */
        condition: ATCondition.STREAM_STARTED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream ends, and off when the stream starts.
         */
        condition: ATCondition.STREAM_ENDED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream title matches, and off when it doesn't match.
         */
        condition: ATCondition.TITLE;
        /**
         * The title to match against. Can be a string, a regular expression, or a function that returns a boolean.
         * If a function is provided, it will be called with the current title and should return true if the title matches.
         * If a string or regular expression is provided, it will be used to match the title directly.
         */
        title: ((title: string) => boolean);
    }
    | {
        /**
         * This reward will be automatically toggled on when the stream title matches, and off when it doesn't match.
         */
        condition: ATCondition.TITLE;
        /**
         * The title to match against. Can be a string, a regular expression, or a function that returns a boolean.
         * If a function is provided, it will be called with the current title and should return true if the title matches.
         * If a string or regular expression is provided, it will be used to match the title directly.
         */
        title: (string | RegExp) | (string | RegExp)[];
        /**
         * The type of title matching to use.
         * If not specified, defaults to `ATTitleType.INCLUDES`.
         */
        type?: ATTitleType;
    }
    | {
        /**
         * This reward will be automatically toggled on when the manager is connected, and off when it is disconnected.
         */
        condition: ATCondition.MANAGER_CONNECTED;
    }
    | {
        /**
         * This reward will be automatically toggled on when the manager is disconnected, and off when it is connected.
         */
        condition: ATCondition.MANAGER_DISCONNECTED;
    };
}

export enum ATTitleType {
    INCLUDES = "includes",
    EXCLUDES = "excludes",
}

export enum ATCategoryType {
    INCLUDES = "includes",
    EXCLUDES = "excludes",
}

type ATCategory =
  | { id: string; name?: string }
  | { id?: string; name: string }
  | { id: string; name: string };

export enum ATCondition {
    CATEGORY = "category",
    STREAM_STARTED = "stream_started",
    STREAM_ENDED = "stream_ended",
    TITLE = "title",
    MANAGER_CONNECTED = "manager_connected",
    MANAGER_DISCONNECTED = "manager_disconnected",
}