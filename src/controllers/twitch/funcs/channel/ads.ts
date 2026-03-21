import type { ChannelSpecificWrapper } from "@twitch/client";

export async function getSchedule(this: ChannelSpecificWrapper) {
  return await this.twcl.api
    .get(`/channels/ads`, {
      params: {
        broadcaster_id: this.channelId,
      },
    })
    .then((res) => {
      return res.data.data;
    });
}

export async function snooze(this: ChannelSpecificWrapper) {
  return await this.twcl.api.post(`/channels/ads/schedule/snooze`, { is_snoozed: true },
    {
      params: {
        broadcaster_id: this.channelId,
      },
    },
  );
}
