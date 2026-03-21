import type TwitchClient from "../client";

export async function completeRedemption(this: TwitchClient, redemption_id: string, reward_id: string) {
    return await this.api.patch(`/channel_points/custom_rewards/redemptions`, {
        status: "FULFILLED"
    }, {
        params: {
          id: redemption_id,
          broadcaster_id: this.IAM.id,
          reward_id: reward_id
        }
    });
}

export async function cancelRedemption(this: TwitchClient, redemption_id: string, reward_id: string) {
    return await this.api.patch(`/channel_points/custom_rewards/redemptions`, {
        status: "CANCELED"
    }, {
        params: {
          id: redemption_id,
          broadcaster_id: this.IAM.id,
          reward_id: reward_id
        }
    });
}