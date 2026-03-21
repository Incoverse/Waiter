import type TwitchClient from "@twitch/client";

export async function sendWhisper(this: TwitchClient, to: string, message: string) {
  return await this.api.post(`/whispers`, { message }, {
      params: {
        from_user_id: this.IAM.id,
        to_user_id: to,
      }
  })
}

export async function isStreaming(this: TwitchClient, id: string = this.IAM.id) {
  return await this.api.get(`/streams`, { params: { user_id: id } })
    .then((res) => res.data.data.length > 0);
}