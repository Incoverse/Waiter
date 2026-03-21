
import type { ChannelSpecificWrapper } from "@twitch/client";
import { paginateData, ResDataData0 } from "@twitch/client";

export async function getStreamInfo(this: ChannelSpecificWrapper, id: string | string[], settings: { all?: boolean } = { all: false }) {
  const userIds = Array.isArray(id) ? id : [id];
  const params: any = { first: 100, user_id: userIds };
  const res = await this.twcl.api.get(`/streams`, { params });
  return await paginateData(this.twcl.api, `/streams`, params, { all: settings.all })(res);
}


export async function getStreams(this: ChannelSpecificWrapper, deeperSearch: { game_id?: string|string[]; type?: "live" | "all", language?: string|string[] } = {}, settings:{all?:boolean, limit:number}={all: false, limit:100}) {
  const params: any = { first: settings.limit, ...deeperSearch };
  const res = await this.twcl.api.get(`/streams`, { params });
  return await paginateData(this.twcl.api, `/streams`, params, { all: settings.all, first: settings.limit })(res);
}

export async function getStreamMarkers(this: ChannelSpecificWrapper, vid: string, settings:{all?:boolean}={all: false}) {
  const params: any = { first: 100 };
  if (vid) params.video_id = vid;
  else params.user_id = this.channelId;
  const res = await this.twcl.api.get(`/streams/markers`, { params });
  return await paginateData(this.twcl.api, `/streams/markers`, params, { all: settings.all })(res);
}


export async function getGame(this: ChannelSpecificWrapper, idOrName: string) {
  const isId = !isNaN(parseInt(idOrName));
  return await this.twcl.api.get(`/games`, { params: { [isId ? "id" : "name"]: idOrName } })
    .then(ResDataData0);
}

export async function getVideos(this: ChannelSpecificWrapper, settings: any) {
  let params: any = { first: 100 };
  Object.keys(settings).filter(a => a !== "all").forEach((key) => { params[key] = settings[key]; });
  let data: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await this.twcl.api.get(`/videos`, { params: { ...params, ...(cursor ? { after: cursor } : {}) } });
    data = data.concat(res.data.data);
    cursor = res.data.pagination?.cursor;
  } while (settings.all && cursor);
  return data;
}

export async function raid(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.post(`/raids`, {}, { params: { from_broadcaster_id: this.channelId, to_broadcaster_id: id } });
}

export async function stopRaid(this: ChannelSpecificWrapper) {
  return await this.twcl.api.delete(`/raids`, { params: { broadcaster_id: this.channelId } });
}

export async function clip(this: ChannelSpecificWrapper) {
  return await this.twcl.api.post(`/clips`, { has_delay: false }, { params: { broadcaster_id: this.channelId } })
    .then((res) => res.data.data[0].edit_url);
}

export async function getClips(this: ChannelSpecificWrapper, broadcaster_id = this.channelId, start_date?: string, end_date?: string, all = false) {
  let params: any = { broadcaster_id, first: 100 };
  if (start_date) params.started_at = start_date;
  if (end_date) params.ended_at = end_date;
  let clips: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await this.twcl.api.get(`/clips`, { params: { ...params, ...(cursor ? { after: cursor } : {}) } });
    clips = clips.concat(res.data.data);
    cursor = res.data.pagination?.cursor;
  } while (all && cursor);
  return clips;
}

export async function getClip(this: ChannelSpecificWrapper, id: string) {
  return await this.twcl.api.get(`/clips`, { params: { id } })
    .then(ResDataData0);
}

export async function getChannelEditors(this: ChannelSpecificWrapper) {
  return await this.twcl.api.get(`/channels/editors`, { params: { broadcaster_id: this.channelId } })
    .then((res) => res.data.data);
}

export async function updateColor(this: ChannelSpecificWrapper, color: string) {
  return await this.twcl.api.put(`/chat/color`, { background_color: color }, { params: { user_id: this.twcl.IAM.id, color } });
}

export async function sendChatAnnouncement(this: ChannelSpecificWrapper, message: string, color: string = "primary") {
  return await this.twcl.api.post(`/chat/announcements`, { message, color }, { params: { broadcaster_id: this.channelId, moderator_id: this.twcl.IAM.id } });
}

export async function get(this: ChannelSpecificWrapper, broadcaster_id: string = this.channelId) {
  return await this.twcl.api.get(`/channels`, {
    params: {
      broadcaster_id: this.channelId,
    },
  }).then(ResDataData0)
}

export async function modify(this: ChannelSpecificWrapper, settings: {
    game_id?: string;
    broadcaster_language?: string;
    title?: string;
    delay?: number;
    tags?: string[];
    content_classification_labels?: {id:"DrugsIntoxication"|"SexualThemes"|"ViolentGraphic"|"Gambling"|"ProfanityVulgarity", is_enabled:boolean}[];
    is_branded_content?: boolean;
}) {
  return await this.twcl.api.patch(`/channels`, settings, {
    params: {
      broadcaster_id: this.channelId,
    }
  });
}