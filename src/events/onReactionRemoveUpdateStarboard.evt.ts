/*
 * Copyright (c) 2025 Inimi | DrHooBs | Incoverse
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

import { DrBotEvent, DrBotEventTypeSettings, DrBotEventTypes } from "@src/lib/base/DrBotEvent.js";
import { Client, Embed, EmbedBuilder, Emoji, Events, Guild, GuildMemberRoleManager, MessageReaction, TextChannel } from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { isSameEmoji } from "@src/lib/utilities/misc.js";

declare const global: DrBotGlobal;

export default class ORRUS extends DrBotEvent {
    declare global: DrBotGlobal;
    
    protected _type: DrBotEventTypes = "discordEvent";

    protected _typeSettings: DrBotEventTypeSettings = {
        listenerKey: Events.MessageReactionRemove,
    }

    protected _priority: number = 0;

    private starboardChannel : TextChannel | null = null;
    
    public async setup(client: Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {
        if (!global.app.config.starboard.enabled) {
            return null
        }


        let guild = client.guilds.cache.get(global.app.config.mainServer) || await client.guilds.fetch(global.app.config.mainServer);
        if (global.app.config.starboard.channel) {
            if (global.app.config.starboard.channel.startsWith("#")) {
                const name = global.app.config.starboard.channel.substring(1);
                this.starboardChannel = guild.channels.cache.find(channel => channel.name == name) as TextChannel;
            } else if (global.app.config.starboard.channel.startsWith("@")) {
                const id = global.app.config.starboard.channel.substring(1);
                this.starboardChannel = (guild.channels.cache.get(id) || await guild.channels.fetch(id)) as TextChannel;
            } else {
                global.app.config.starboard.channel = null;
                global.logger.debugWarn("Starboard channel is not a valid channel ID or name", this.fileName);
            }
        }

        if (global.app.config.starboard.channel == null) {
            this.starboardChannel = guild.channels.cache.find(channel => /star(-){0,1}board/gi.test(channel.name)) as TextChannel; // Find a channel that has "starboard" in the name (varying formats)
        }

        if (!this.starboardChannel) {
            global.logger.debugWarn("Starboard channel not found, cannot proceed.", this.fileName);
            return false;
        } else {
            global.logger.debug(`Starboard channel found: ${this.starboardChannel.name}`, this.fileName);
        }

        return super.setup(client, reason);
    }

    public async runEvent(reaction: MessageReaction) {

        if (reaction.partial) {
            try {
                await reaction.fetch();
                await reaction.message.author.fetch();

            } catch (error) {
                global.logger.error("Something went wrong when fetching the message: ", error, this.fileName);
                return;
            }
        }

        if (reaction.message.guildId != global.app.config.mainServer) return;


        if (isSameEmoji(reaction.emoji, global.app.config.starboard.emoji)) {
            
            let count = reaction.count;

            if (reaction.message.channel.id == this.starboardChannel.id) return;
            
            if ((reaction.message.channel as TextChannel).name.match(/(staff|mod|admin)/i)) {
                return;
            }

            if (count >= global.app.config.starboard.triggerAmount) {
                //Check if message is already starred
                let msgs = await (this.starboardChannel as TextChannel).messages.fetch();
                const existing = msgs.find(msg => msg.embeds[0]?.description?.match(/(?!\/[0-9]{19,999}\/[0-9]{16,999}\/)[0-9]{16,999}(?=.$)/mg)[0] == reaction.message.id);
                if (existing) {
                    existing.edit({
                        content: existing.content.replace(existing.content.match(/\s+.*?(\d+)/i)[1], `${count}`),
                    });
                }
            } else if (count == 0) {
                //Check if message is already starred
                let msgs = await (this.starboardChannel as TextChannel).messages.fetch();

                const existing = msgs.find(msg => msg.embeds[0]?.description?.match(/(?!\/[0-9]{19,999}\/[0-9]{16,999}\/)[0-9]{16,999}(?=.$)/mg)[0] == reaction.message.id);
                if (existing) {
                    existing.delete();
                }
            }
        }
    }

}

