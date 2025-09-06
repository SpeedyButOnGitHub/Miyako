const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage"); // Add this import

const ROLE_LOG_CHANNEL = "1232739307736010854";

async function logRoleChange(client, member, role, action) {
  if (config.roleLogBlacklist.includes(role.id)) return; // Use config blacklist

  const channel = await client.channels.fetch(ROLE_LOG_CHANNEL).catch(err => {
    console.error("[Role Log Error]:", err);
    return null;
  });
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Role ${action === "add" ? "Added" : "Removed"}`)
    .setColor(action === "add" ? 0x55ff55 : 0xff5555)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .addFields(
      { name: "Role", value: `<@&${role.id}>`, inline: true },
      { name: "Member", value: `<@${member.id}>`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

module.exports = {
  logRoleChange
};