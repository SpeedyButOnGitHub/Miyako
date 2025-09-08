const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");
const theme = require("./theme");

const ROLE_LOG_CHANNEL = "1232739307736010854";
const TEST_LOG_CHANNEL = "1413966369296220233";

async function logRoleChange(client, member, role, action) {
  if (config.roleLogBlacklist.includes(role.id)) return;

  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : ROLE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(err => {
    console.error("[Role Log Error]:", err);
    return null;
  });
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Role ${action === "add" ? "Added" : "Removed"}`)
    .setColor(action === "add" ? theme.colors.success : theme.colors.danger)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .addFields(
      { name: "Role", value: `<@&${role.id}>`, inline: true },
      { name: "Member", value: `<@${member.id}>`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

module.exports = {
  logRoleChange
};