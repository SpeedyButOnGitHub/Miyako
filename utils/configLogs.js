const { EmbedBuilder } = require("discord.js");
const { CONFIG_LOG_CHANNEL } = require("./logChannels");

<<<<<<< HEAD
/**
 * @param {import('discord.js').Client} client
 * @param {{user:{id:string,tag?:string,displayAvatarURL?:Function}, change:string}} params
 */
async function logConfigChange(client, { user, change }) {
=======
async function logConfigChange(client, user, change) {
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
  const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("Config Changed")
    .setColor(0x5865F2)
    .setAuthor({ name: user.tag || user.id, iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined })
    .setDescription(change)
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { logConfigChange };