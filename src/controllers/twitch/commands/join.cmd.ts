/*
  * Copyright (c) 2025 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { shorten } from "@/controllers/web";
import type TwitchClient from "@twitch/client";
import { redirectURI } from "@twitch/client";
import WaiterCommand, { type CommandSettings, type WhisperMessage } from "@twitch/lib/base/WaiterCommand";
import { eq, Table } from "surrealdb";
import { generateAuthURL } from "../lib/authentication";
import CooldownSystem, { CooldownWrapper } from "../lib/cooldown";


export default class JoinCMD extends WaiterCommand {
  public messageTrigger: RegExp = /^!join\s+(\w+)$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
    cooldownActiveMessage: "Please wait {{time}} before using this command again."
  });

  public override settings: CommandSettings = {
    scope: "dm"
  }

  @CooldownWrapper()
  public async exec(recipient: TwitchClient, message: WhisperMessage): Promise<any> {

    if (global.twitch.streamers.has(message.from_user_id)) {
      return recipient.sendWhisper(message.from_user_id, "You are already a streamer in the system.");
    }

    const code = message.whisper.text.match(this.messageTrigger)?.[1];

    if (!code) {
      return recipient.sendWhisper(message.from_user_id, "Invalid command format. Use: !join <code>");
    }

    const isCodeValid = (await global.db.select(new Table("twitch_auth_codes")).where(eq("code", code))).length > 0;

    if (!isCodeValid) {
      return recipient.sendWhisper(message.from_user_id, "Invalid code. Please check the code and try again.");
    }

    const authUrl = generateAuthURL(redirectURI, Buffer.from(code).toString("base64url"));
    
    const shortenedUrl = shorten(authUrl);

    return recipient.sendWhisper(message.from_user_id, `To join the system, please click the following URL: ${shortenedUrl}`);
  }
}