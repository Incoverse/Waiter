import TwitchClient from "../client";
import type { TwitchRedemption } from "../types";

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

export async function getRewards(this: TwitchClient, id=null, only_manageable = false): Promise<TwitchRedemption[]> {
  return await this.api.get(`/channel_points/custom_rewards`, {
    params: {
      broadcaster_id: this.IAM.id,
      id: id || undefined,
      only_manageable_rewards: only_manageable || undefined
    }
  }).then((res) => {
    return res.data.data;
  })
}

export async function updateReward(this: TwitchClient, id: string, settings: {
    title?: string;
    cost?: number;
    prompt?: string;
    is_enabled?: boolean;
    is_paused?: boolean;
    background_color?: string;
    is_user_input_required?: boolean;
    is_max_per_stream_enabled?: boolean;
    max_per_stream?: number;
    is_max_per_user_per_stream_enabled?: boolean;
    max_per_user_per_stream?: number;
    is_global_cooldown_enabled?: boolean;
    global_cooldown_seconds?: number;
    should_redemptions_skip_request_queue?: boolean;
}) {
  return await this.api.patch(`/channel_points/custom_rewards`, settings, {
    params: {
      id: id,
      broadcaster_id: this.IAM.id
    }
  });
}

export async function createReward(this: TwitchClient, settings: {
    title: string;
    cost: number;
    prompt?: string;
    is_enabled?: boolean;
    background_color?: string;
    is_user_input_required?: boolean;
    is_max_per_stream_enabled?: boolean;
    max_per_stream?: number;
    is_max_per_user_per_stream_enabled?: boolean;
    max_per_user_per_stream?: number;
    is_global_cooldown_enabled?: boolean;
    global_cooldown_seconds?: number;
    should_redemptions_skip_request_queue?: boolean;
}) {

    return await this.api.post(`/channel_points/custom_rewards`, {
        title: settings.title,
        cost: settings.cost,
        prompt: settings.prompt,
        is_enabled: settings.is_enabled,
        background_color: settings.background_color,
        is_user_input_required: settings.is_user_input_required,
        is_max_per_stream_enabled: settings.is_max_per_stream_enabled ?? !!settings.max_per_stream,
        max_per_stream: settings.max_per_stream,
        is_max_per_user_per_stream_enabled: settings.is_max_per_user_per_stream_enabled ?? !!settings.max_per_user_per_stream,
        max_per_user_per_stream: settings.max_per_user_per_stream,
        is_global_cooldown_enabled: settings.is_global_cooldown_enabled ?? !!settings.global_cooldown_seconds,
        global_cooldown_seconds: settings.global_cooldown_seconds,
        should_redemptions_skip_request_queue: settings.should_redemptions_skip_request_queue
    }, {
        params: {
          broadcaster_id: this.IAM.id
        }
    }).then((res) => {
        return res.data.data[0];
    })
}


export async function deleteReward(this: TwitchClient, id: string) {
  return await this.api.delete(`/channel_points/custom_rewards`, {
    params: {
      broadcaster_id: this.IAM.id,
      id: id
    }
   });
}