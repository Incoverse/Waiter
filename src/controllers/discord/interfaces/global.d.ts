import type { Client } from "discord.js";
import type DiscordController from "..";
declare global {
  var discord: {
    controller: DiscordController,
    client: Client
  };
}

export { };

