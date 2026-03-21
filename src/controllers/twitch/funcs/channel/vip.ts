import type { ChannelSpecificWrapper } from "@twitch/client";


export async function add(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.post(`/channels/vips?user_id=${id}&broadcaster_id=${this.channelId}`, {}).catch((err) => null);
}

export async function remove(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.delete(`/channels/vips?user_id=${id}&broadcaster_id=${this.channelId}`).catch(() => null);
}

export async function is(this: ChannelSpecificWrapper, id: string) {
  return this.twcl.api.get(`/channels/vips?user_id=${id}&broadcaster_id=${this.channelId}`).then((res) => {
    const jsonified = res.data instanceof Object || res.data instanceof Array ? res.data : JSON.parse(res.data);
    return jsonified.data.filter((vip: any) => vip.user_id === id).length > 0;
  }).catch(() => false);
}