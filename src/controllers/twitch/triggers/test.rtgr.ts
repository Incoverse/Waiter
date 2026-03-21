import type TwitchClient from "../client";
import WaiterRedemptionTrigger, { type RedeemableInfo, type RedemptionInfo } from "../lib/base/WaiterRedemptionTrigger";

export default class TestTrigger extends WaiterRedemptionTrigger {
    public override redemptionTrigger: RegExp | ((event: RedeemableInfo) => Promise<boolean>) = /test/i;

    public override async exec(streamer: TwitchClient, data: RedemptionInfo) {
        await this.bot.withChannel(streamer).sendMessage(`Test trigger executed by @${data.redeemer.login} with input: ${data.redemption.user_input}`);
    }
}