const { EmbedBuilder } = require("discord.js");
const { CONFIG_LOG_CHANNEL } = require("./logChannels");
const theme = require("./theme");
const { applyStandardFooter } = require("./ui");

/**
 * @param {import('discord.js').Client} client
 * @param {{user:{id:string,tag?:string,displayAvatarURL?:Function}, change:string}} params
 */
async function logConfigChange(client, { user, change }) {
  const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Config Changed")
    .setColor(theme.colors.primary)
    .setAuthor({ name: user.tag || user.id, iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined })
    .setDescription(change)
    .setTimestamp();
  applyStandardFooter(embed, channel.guild, { testingMode: false });

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

module.exports = { logConfigChange };