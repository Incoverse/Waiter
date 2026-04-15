import { formatDuration, parseDuration } from "@/lib/misc";
import { paginateData, ResDataData0, type ChannelSpecificWrapper } from "@twitch/client";
import type { UserResolvable } from "../../types";

export async function send(this: ChannelSpecificWrapper, message: string, {replyTo}: {replyTo?: string} = {}) {


  let api = this.twcl.api;

  if (
    //? Is bot, and config says that bots should have the badge
    (this.twcl.isBot && global.config.twitch!.bot!.showBotBadge)
  ) api = global.twitch.appAuth.api; // Use app auth so that the chat bot badge shows up.


  return await api.post(`/chat/messages`, {
    message: message.trim(),
    broadcaster_id: this.channelId,
    sender_id: this.twcl.IAM.id,
    ...(replyTo ? {reply_parent_message_id: replyTo} : {})
  }).then(ResDataData0).catch(() => false);
};

export async function remove(this: ChannelSpecificWrapper, messageId: string) {
  return await this.twcl.api.delete(`/moderation/chat`, {
    params: {
        broadcaster_id: this.channelId,
        moderator_id: this.twcl.IAM.id,
        message_id: messageId
    }
  }).catch(() => false);
}

export async function clear(this: ChannelSpecificWrapper) {
  return await this.twcl.api.delete(`/moderation/chat`, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  }).catch(() => false);
}

export async function slowMode(this: ChannelSpecificWrapper, waitTime: string) { // 3m20s

  if (waitTime.toLowerCase() === "off" || parseDuration(waitTime) === 0) {
    return await this.twcl.api.patch(`/chat/settings`, { slow_mode: false }, {
      params: {
        broadcaster_id: this.channelId,
        moderator_id: this.twcl.IAM.id
      }
    }).catch(() => false);
  } else {

    const parsedWaitTimeMs = parseDuration(waitTime);

    if (!parsedWaitTimeMs) {
      throw new Error("Invalid wait time format. Use formats like '30s', '5m', '1h', or 'off' to disable slow mode.");
    }

    if (parsedWaitTimeMs < parseDuration("3s") || parsedWaitTimeMs > parseDuration("2m")) {
      throw new Error("Wait time must be between 3 seconds and 2 minutes.");
    }

    return await this.twcl.api.patch(`/chat/settings`, { slow_mode: true, slow_mode_wait_time: Math.round(parsedWaitTimeMs/1000) }, {
      params: {
        broadcaster_id: this.channelId,
        moderator_id: this.twcl.IAM.id
      }
    }).catch(() => false);
  }
}

export async function followersOnly(this: ChannelSpecificWrapper, followsForAtLeast: string) {

  if (followsForAtLeast.toLowerCase() === "off") {
    return await this.twcl.api.patch(`/chat/settings`, { follower_mode: false }, {
      params: {
        broadcaster_id: this.channelId,
        moderator_id: this.twcl.IAM.id
      }
    }).catch(() => false);
  }

  const followsForMs = parseDuration(followsForAtLeast); // Twitch API expects minutes

  if (followsForMs < parseDuration("0s") || followsForMs > parseDuration("3mo")) {
    throw new Error("Follow time must be between 0 seconds and 3 months.");
  }

  const followsFor = Math.round(followsForMs / (1000 * 60)); // Convert ms to minutes

  return await this.twcl.api.patch(`/chat/settings`, { follower_mode: true, follower_mode_duration: followsFor }, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  }).catch(() => false);
  
}

export async function subOnly(this: ChannelSpecificWrapper, on: boolean) {
  return await this.twcl.api.patch(`/chat/settings`, { subscriber_mode: on }, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  });
}

export async function emoteOnly(this: ChannelSpecificWrapper, on: boolean) {
  return await this.twcl.api.patch(`/chat/settings`, { emote_mode: on }, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  });
}

export async function uniqueMode(this: ChannelSpecificWrapper, on: boolean) {
  return await this.twcl.api.patch(`/chat/settings`, { unique_chat: on }, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  });
}

export async function delay(this: ChannelSpecificWrapper, delay: "off" | "2s" | "4s" | "6s") {
  if (delay.toLowerCase() === "off" || parseDuration(delay) === 0) {
    return await this.twcl.api.patch(`/chat/settings`, { non_moderator_chat_delay: false }, {
      params: {
        broadcaster_id: this.channelId,
        moderator_id: this.twcl.IAM.id
      }
    }).catch(() => false);
  }

  const delayMs = parseDuration(delay);
  const mustBeOneOf = ["2s", "4s", "6s"].map(parseDuration);

  if (!mustBeOneOf.some((allowedDelay) => allowedDelay === delayMs)) {
    throw new Error("Invalid delay format. Use 'off' to disable or one of the following values: " + mustBeOneOf.map((d) => formatDuration(d)).join(", "));
  }

  return await this.twcl.api.patch(`/chat/settings`, { non_moderator_chat_delay: true, non_moderator_chat_delay_duration: Math.round(delayMs / 1000) }, {
    params: {
      broadcaster_id: this.channelId,
      moderator_id: this.twcl.IAM.id
    }
  }).catch(() => false);
}

export async function getSettings(this: ChannelSpecificWrapper) {
  return await this.twcl.api.get(`/chat/settings`, {
    params: {
      broadcaster_id: this.channelId,
    }
  }).then(ResDataData0).catch(() => null);
}

export async function getChatters(this: ChannelSpecificWrapper, all = false) {
  const params = {
    broadcaster_id: this.channelId,
    moderator_id: this.twcl.IAM.id
  };

  return await this.twcl.api.get(`/chat/chatters`, { params })
    .then(paginateData(this.twcl.api, `/chat/chatters`, params, { all, first: 1000 }))
    .catch(() => null);
}

export async function shoutout(this: ChannelSpecificWrapper, id: UserResolvable) {
  const resolvedId = await this.twcl.resolveUserId(id);
  if (!resolvedId) {
    return null;
  }
  return await this.twcl.api.post(`/chat/shoutouts`, {
    from_broadcaster_id: this.channelId,
    to_broadcaster_id: resolvedId,
    moderator_id: this.twcl.IAM.id
  });
}