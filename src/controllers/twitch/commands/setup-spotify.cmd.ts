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

import type TwitchClient from "@twitch/client";
import WaiterCommand, { type CommandSettings, type WhisperMessage } from "@twitch/lib/base/WaiterCommand";
import { UserIsRegisteredStreamer } from "../lib/conditions";
import CooldownSystem, { CooldownWrapper } from "../lib/cooldown";


export default class SetupSpotifyCMD extends WaiterCommand {
  public messageTrigger: RegExp = /^!setup\s+spotify$/;

  public override cooldown: CooldownSystem = new CooldownSystem({
    type: "user",
    cooldownTime: "30s",
    cooldownActiveMessage: "Please wait {{time}} before using this command again."
  });

  public override settings: CommandSettings = {
    scope: "dm"
  }

  @CooldownWrapper()
  @UserIsRegisteredStreamer()
  public async exec(recipient: TwitchClient, message: WhisperMessage): Promise<any> {
    return recipient.sendWhisper(message.from_user_id, "Spotify integration setup is currently in development. Stay tuned for updates!").catch((err) => {
      this.logger.warn("Error sending Spotify setup response:", err);
    });
  }
}