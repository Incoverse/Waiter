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

import CacheManager from "@/lib/cache.js";
import type TwitchClient from "../../client.js";

export default abstract class WaiterRedemptionTrigger {
    protected bot: TwitchClient;

    protected cache: CacheManager = new CacheManager();

    public loaded: boolean = false;

    public constructor(bot: TwitchClient) {
      this.bot = bot;
    }

    public abstract redemptionTrigger: RegExp | ((event: RedeemableInfo) => Promise<boolean>); //! Trigger on redemption title that matches this regex



    public async cancelRedemption(streamer: TwitchClient, redemption: RedemptionInfo): Promise<boolean> {
      return streamer.cancelRedemption(redemption.redemption.id, redemption.reward_id).then((e)=>e.status==200).catch((e)=>false)
    }

    public async fulfillRedemption(streamer: TwitchClient, redemption: RedemptionInfo): Promise<boolean> {
      return streamer.completeRedemption(redemption.redemption.id, redemption.reward_id).then((e)=>e.status==200).catch((e)=>false)
    }

    /**
     * Setup the redemption trigger
     * 
     * Returns:
     * - `true` if the redemption trigger was successfully setup
     * - `false` if the redemption trigger failed to setup, and to announce that it failed
     * - `null` if the redemption trigger failed to setup or is not needed, but to fail silently
     */
    public async setup(clients: TwitchClient[]): Promise<boolean | null> {
        this.loaded = true;
        return this.loaded;
    }

    /**
     * Unload the redemption trigger
     * 
     * Returns:
     * - `true` if the redemption trigger was successfully unloaded
     * - `false` if the redemption trigger failed to unload, and to announce that it failed
     * - `null` if the redemption trigger failed to unload, but to fail silently
     */
    public async unload(clients: TwitchClient[]): Promise<boolean | null> {
        this.loaded = false;
        return this.loaded;
    }
    public abstract exec(streamer: TwitchClient, event: RedemptionInfo): Promise<any>; //! Execute the redemption trigger
}

export type RedeemableInfo = {
  reward_id: string,
  redemption_id: string,
  title: string,
  cost: number,
  prompt: string,
  input?: string
}

export type RedemptionInfo = {
  reward_id: string,
  redeemer: {
    id: string,
    login: string,
    display_name: string
  },
  redemption: {
    status: "UNFULFILLED" | "FULFILLED" | "CANCELED",
    id: string,
    title: string,
    prompt: string,
    cost: number,
    user_input?: string,
  },
  redeemed_at: string,
}
