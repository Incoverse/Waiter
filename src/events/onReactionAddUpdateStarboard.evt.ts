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
import { Client, Embed, EmbedBuilder, Events, Guild, TextChannel } from "discord.js";
import { DrBotGlobal } from "@src/interfaces/global.js";

export default class ORAUS extends DrBotEvent {
    declare global: DrBotGlobal;
    
    protected _type: DrBotEventTypes = "discordEvent";

    protected _typeSettings: DrBotEventTypeSettings = {
        listenerKey: Events.MessageReactionAdd,
    }

    protected _priority: number = 0;
    

    public async runEvent(reaction, user, client: Client) {
        if (global.app.config.starboardEmojiID === "" || global.app.config.starboardEmojiSTR === "" || global.app.config.starboardNumber === 0) {
            return;
        }
        if (reaction.partial) {
            try {
                await reaction.fetch();
                await user.fetch();
            } catch (error) {
                console.error("Something went wrong when fetching the message: ", error);
                return;
            }
        }
        let embed = new EmbedBuilder()
            .setAuthor({
                name: reaction.message.author.username,
                iconURL: reaction.message.author.displayAvatarURL()

            })
            .setDescription(reaction.message.content)
            .addFields({
                name: "Source",
                value: `[Jump to message](${reaction.message.url})`
            })
            .setFooter({
                text: `${reaction.message.id} • ${client.user.username}'s Starboard`
            })

        if (reaction.emoji.name == global.app.config.starboardEmojiSTR) {
            let guild = reaction.message.guild as Guild;
            let starboardChannel = guild.channels.cache.find(channel => /star(-){0,1}board/gi.test(channel.name)); // Find a channel that has "starboard" in the name (varying formats)
            if (reaction.message.channel.id == starboardChannel.id) { return }
            if (!starboardChannel) {
                console.log("Starboard channel not found");
                return;
            }
            let count = reaction.count;
            if (count >= global.app.config.starboardNumber) {
                //Check if message is already starred
                let msgs = await (starboardChannel as TextChannel).messages.fetch();
                const existing = msgs.find(msg => msg.embeds[0]?.footer?.text == `${reaction.message.id} • DrBot's Starboard`);
                if (existing) {
                    embed.setAuthor(null)
                        console.log("Message already starred");
                        if (count > existing.content.match(new RegExp(`/${global.app.config.starboardEmojiID} (\d+)/)[1])`))) {
                            existing.edit({
                                content: `${global.app.config.starboardEmojiID} ${count}`,
                                embeds: [embed]
                            });
                        } else {
                            return;
                        }
                    }
                else {
                
                    await (starboardChannel as TextChannel).send({
                        content: `${global.app.config.starboardEmojiID} ${reaction.count}`,
                        embeds: [embed]
                    });
                }
            }
        }
    }
}
