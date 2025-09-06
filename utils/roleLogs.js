const { EmbedBuilder } = require("discord.js");
const { ROLE_LOG_CHANNEL } = require("./logChannels");

async function logRoleChange(client, member, role, action) {
  const channel = await client.channels.fetch(ROLE_LOG_CHANNEL).catch(() => null);
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

export { logRoleChange };