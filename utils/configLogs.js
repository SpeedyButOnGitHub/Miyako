import { EmbedBuilder } from "discord.js";
import { CONFIG_LOG_CHANNEL } from "./logChannels.js";

async function logConfigChange(client, user, change) {
  const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Config Changed")
    .setColor(0x5865F2)
    .setAuthor({ name: user.tag || user.id, iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined })
    .setDescription(change)
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export { logConfigChange };