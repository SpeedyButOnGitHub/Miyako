const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");

const MEMBER_LEAVE_LOG_CHANNEL = "1232701769859993628";
const TEST_LOG_CHANNEL = "1413966369296220233";

/**
 * Logs when a member leaves the guild.
 * @param {Client} client - Discord client
 * @param {GuildMember} member - The member that left
 * @param {boolean} isTest - If true, marks the log as a test event
 */
async function logMemberLeave(client, member, isTest = false) {
  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MEMBER_LEAVE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;

  const joinedAt = member.joinedTimestamp;
  const leftAt = Date.now();
  let duration = "Unknown";
  if (joinedAt) {
    const ms = leftAt - joinedAt;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    duration = `${days}d ${hours}h ${minutes}m`;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .setColor(isTest ? 0xffd700 : 0xff5555)
    .setTitle(isTest ? "👋 [TEST EVENT] Member Left" : "👋 Member Left")
    .setDescription(`<@${member.id}> has left the server.${isTest ? "\n\n🧪 This is a test event." : ""}`)
    .addFields(
      { name: "Joined", value: joinedAt ? `<t:${Math.floor(joinedAt / 1000)}:F>` : "Unknown", inline: true },
      { name: "Left", value: `<t:${Math.floor(leftAt / 1000)}:F>`, inline: true },
      { name: "Time in Server", value: duration, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

module.exports = {
  logMemberLeave
};
