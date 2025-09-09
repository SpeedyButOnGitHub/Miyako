const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");
const theme = require("./theme");
const { applyStandardFooter } = require("./ui");
const { ROLE_LOG_CHANNEL, TEST_LOG_CHANNEL } = require("./logChannels");
const { logError } = require("./errorUtil");

async function logRoleChange(client, member, role, action) {
  if (config.roleLogBlacklist.includes(role.id)) return;

  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : ROLE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(err => { logError('roleLogs:fetch', err); return null; });
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`${action === "add" ? theme.emojis.enable : theme.emojis.disable} Role ${action === "add" ? "Added" : "Removed"}`)
    .setColor(action === "add" ? theme.colors.success : theme.colors.danger)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .addFields(
      { name: "Role", value: `<@&${role.id}>`, inline: true },
      { name: "Member", value: `<@${member.id}>`, inline: true }
    )
    .setTimestamp();
  applyStandardFooter(embed, member.guild, { testingMode: config.testingMode });

  try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); } catch (e) { logError('roleLogs:send', e); }
}

module.exports = {
  logRoleChange
};