const { CONFIG_LOG_CHANNEL } = require("./logChannels");
const theme = require("./theme");
const { applyStandardFooter } = require("./ui");
const { logError } = require("./errorUtil");
const { createEmbed } = require('./embeds');

/**
 * @param {import('discord.js').Client} client
 * @param {{user:{id:string,tag?:string,displayAvatarURL?:Function}, change:string}} params
 */
async function logConfigChange(client, { user, change, before, after }) {
  const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(e => { logError('configLogs:fetch', e); return null; });
  if (!channel) return;

  let diffBlock = '';
  try {
    if (before !== undefined || after !== undefined) {
      const bStr = JSON.stringify(before); const aStr = JSON.stringify(after);
      diffBlock = `\n\nBefore: \`${(bStr||'').slice(0,200)}\`\nAfter: \`${(aStr||'').slice(0,200)}\``;
    }
  } catch {}
  const embed = createEmbed({
    title: "Config Changed",
    description: change + diffBlock,
    color: theme.colors.primary
  }).setAuthor({ name: user.tag || user.id, iconURL: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined });
  applyStandardFooter(embed, channel.guild, { testingMode: false });

  try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); } catch (e) { logError('configLogs:send', e); }
}

module.exports = { logConfigChange };