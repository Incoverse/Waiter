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
import { Client, Embed, EmbedBuilder, Events, Guild, MessageReaction, TextChannel } from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { isSameEmoji } from "@src/lib/utilities/misc.js";

declare const global: DrBotGlobal;

export default class ORAUS extends DrBotEvent {
    declare global: DrBotGlobal;
    
    protected _type: DrBotEventTypes = "discordEvent";

    protected _typeSettings: DrBotEventTypeSettings = {
        listenerKey: Events.MessageReactionAdd,
    }

    protected _priority: number = 0;
    
    public async setup(client: Client, reason: "reload" | "startup" | "duringRun" | null): Promise<boolean> {
        if (!global.app.config.starboard.enabled) {
            return null
        }
        return super.setup(client, reason);
    }

    public async runEvent(reaction: MessageReaction) {
        if (reaction.partial) {
            try {
                await reaction.fetch();
                await reaction.message.author.fetch();

                
            } catch (error) {
                console.error("Something went wrong when fetching the message: ", error);
                return;
            }
        }

        let embed = new EmbedBuilder()
            .setAuthor({
                name: reaction.message.author.displayName,
                iconURL: reaction.message.author.displayAvatarURL()
            })
            .setDescription(reaction.message.content)
            .addFields({
                name: "Source",
                value: `[Jump to message](${reaction.message.url})`
            })
            .setFooter({
                text: `${reaction.message.id} • ${reaction.client.user.displayName}'${reaction.client.user.displayName.toLowerCase().endsWith("s") ? "" : "s"} Starboard`
            })
        
        if (isSameEmoji(reaction.emoji, global.app.config.starboard.emoji)) {
            let guild = reaction.message.guild as Guild;
            let starboardChannel = guild.channels.cache.find(channel => /star(-){0,1}board/gi.test(channel.name)); // Find a channel that has "starboard" in the name (varying formats)

            if (reaction.message.channel.id == starboardChannel.id) return;
            
            if ((reaction.message.channel as TextChannel).name.match(/(staff|mod|admin)/i)) {
                return;
            }

            if (!starboardChannel) {
                console.log("Starboard channel not found");
                return;
            }
            let count = reaction.count;
            if (count >= global.app.config.starboard.triggerAmount) {
                //Check if message is already starred
                let msgs = await (starboardChannel as TextChannel).messages.fetch();
                const existing = msgs.find(msg => msg.embeds[0]?.footer?.text == `${reaction.message.id} • ${reaction.client.user.displayName}'${reaction.client.user.displayName.toLowerCase().endsWith("s") ? "" : "s"} Starboard`);
                if (existing) {
                        console.log("Message already starred");
                        if (count > parseInt(existing.content.match(/f/i)[1])) {
                            existing.edit({
                                content: `${global.app.config.starboard.emoji} ${count}`,
                                embeds: [embed]
                            });
                        } else {
                            return;
                        }
                    }
                else {
                
                    await (starboardChannel as TextChannel).send({
                        content: `${global.app.config.starboard.emoji} ${reaction.count}`,
                        embeds: [embed]
                    });
                }
            }
        }
    }
}
