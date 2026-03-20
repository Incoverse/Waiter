import type TwitchClient from "../client";

export async function sendWhisper(this: TwitchClient, to: string, message: string) {
  return await this.api.post(`/whispers`, { message }, {
      params: {
        from_user_id: this.IAM.id,
        to_user_id: to,
      }
  })
}