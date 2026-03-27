import CacheManager from "@/lib/cache.js";
import { deepAssign, formatDuration, parseDuration } from "@/lib/misc.js";
import type TwitchClient from "@twitch/client";
import type { Message } from "./base/WaiterCommand";


const defaultSettings: Partial<CooldownSettings> = {
  resetOnStreamEnd: false,
  cooldownTime: "1m", // 1 minute default cooldown
  cooldownActiveMessage: null, // null means no message
}

export default class CooldownSystem {
  private settings: CooldownSettings = null;
  private cache: CacheManager = new CacheManager();

  constructor(settings: CooldownSettings) {
    this.settings = deepAssign(defaultSettings, settings) as CooldownSettings;

    if (this.settings.resetOnStreamEnd) {
      global.broadcaster.events.on("stream.offline", (streamer: TwitchClient) => {
        for (const [key] of this.cache.entries()) {
          if (key.startsWith(`${streamer.IAM.id}-`)) {
            this.cache.delete(key);
          }
        }
      })
    }
  }




  public setCooldown(prefix: string, identifierOrState: string | boolean, duration: string | null = null) {
    const durationMs = duration == null ? null : parseDuration(duration);
    if (!durationMs && duration !== null) return false;

    switch (this.settings.type) {
      case "global":
        if (identifierOrState == null) identifierOrState = true;
        if (!(typeof identifierOrState == "boolean")) return false;
        if (!identifierOrState) {
          this.cache.delete(`${prefix}-global`);
        } else {
          this.cache.set(`${prefix}-global`, identifierOrState, durationMs);
        }
        break;
      case "user":
        if (identifierOrState == null) return false;
        if (!(typeof identifierOrState == "string")) return false;
        this.cache.set(`${prefix}-user-${identifierOrState}`, true, durationMs);
        break;
      case "switch":
        if (identifierOrState == null) return true;
        if (!(typeof identifierOrState == "boolean")) return false;
        if (!identifierOrState) {
          this.cache.delete(`${prefix}-cooldown`);
        } else {
          this.cache.set(`${prefix}-cooldown`, identifierOrState, durationMs);
        }
        break;
      default:
        return false;
    }

    return true;
  }

  public clearCooldown(prefix: string, identifier?: string) {
    switch (this.settings.type) {
      case "global":
        this.cache.delete(`${prefix}-global`);
        break;
      case "user":
        if (identifier == null) return false;
        this.cache.delete(`${prefix}-user-${identifier}`);
        break;
      case "switch":
        this.cache.delete(`${prefix}-cooldown`);
        break;
      default:
        return false;
    }

    return true;
  }

  public hasCooldown(prefix: string, identifier?: string) {
      switch (this.settings.type) {
          case "global":
              return this.cache.has(`${prefix}-global`);
          case "user":
              if (identifier == null) return false;
              return this.cache.has(`${prefix}-user-${identifier}`);
          case "switch":
              return this.cache.has(`${prefix}-cooldown`);
          default:
              return false;
      }
  }

  public process(message: Message): {
    valid: boolean,
    message?: string
  } {

    const broadcasterId = "broadcaster_user_id" in message ? message.broadcaster_user_id : message.to_user_id;
    const userId = "chatter_user_id" in message ? message.chatter_user_id : message.from_user_id;

    if (this.hasCooldown(broadcasterId, userId)) {
      return {
        valid: false,
        message: this.settings.cooldownActiveMessage == null ? null : this.getCooldownMessage(broadcasterId, userId, message)
      }
    }

    if (this.settings.type !== "switch") {
      this.setCooldown(broadcasterId, userId, this.settings.cooldownTime);
    }

    return {
      valid: true
    }
  }


  private getCooldownMessage(prefix:string, identifier: string, message: Message): string {
    let messageBase = this.settings.cooldownActiveMessage;

    const cooldownMessage = messageBase
      .replace("{{time}}", formatDuration(this.getMsLeft(prefix, identifier), true, true))
      .replace("{{user}}", "chatter_user_name" in message ? message.chatter_user_name : message.from_user_name);

    return cooldownMessage;

  }

  private getMsLeft(prefix: string, identifier: string): number {
    const cooldown = this.cache.getExpiry(`${prefix}-user-${identifier}`);
    if (!cooldown) return 0;
    return cooldown?.getTime() - Date.now();
  }

}


export type CooldownSettings = {
  resetOnStreamEnd?: boolean, // default: false
  cooldownActiveMessage?: string | null // default: null
} & (
  {
    type: "switch"
  } |
  {
    type: "global",
    cooldownTime: string // default: 1m (1 minute)
  } |
  {
    type: "user"
    cooldownTime: string // default: 1m (1 minute)
  }
)


export function CooldownWrapper() {
  return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (streamer: TwitchClient, message: Message) {
      if (this.cooldown) {
        const cooldownResult = this.cooldown.process(message);
        if (!cooldownResult.valid) {
          await this.bot.withChannel(streamer).sendMessage(cooldownResult.message, { replyTo: "message_id" in message ? message.message_id : null }).catch((err: Error) => {
            this.logger.warn("Error sending cooldown message:", err);
          });
          return;
        }
      }

      return originalMethod.apply(this, [streamer, message]);
    };
    
    return descriptor;
  }
}