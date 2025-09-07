const { EmbedBuilder } = require("discord.js");

// Only log moderation actions in the user action channel
const USER_ACTION_LOG_CHANNEL = "1232701768383729791";

/**
 * Logs moderation actions in the user action channel only
 * @param {Client} client
 * @param {GuildMember|User} target
 * @param {User|{id:string,tag?:string}} moderator
 * @param {string} action - e.g. "muted", "unmuted", "banned", "warned", "warning removed"
 * @param {string|null} reason
 * @param {boolean} isPunishment
 * @param {string|null} duration
 * @param {number|null} currentWarnings
 * @returns {Promise<import('discord.js').Message| null>}
 */
async function sendModLog(
  client,
  target,
  moderator,
  action,
  reason = null,
  isPunishment = true,
  duration = null,
  currentWarnings = null
) {
  const channel = await client.channels.fetch(USER_ACTION_LOG_CHANNEL).catch(() => null);
  if (!channel) return null;

  const targetUser = target.user ? target.user : target; // GuildMember or User
  const modUser = moderator;

  const color = isPunishment ? 0xff5555 : 0x55ff55;
  const lines = [];
  if (reason) lines.push(`📝 Reason: ${reason}`);
  if (duration) lines.push(`⏰ Duration: ${duration}`);
  if (currentWarnings !== null && currentWarnings !== undefined) lines.push(`⚠️ Warnings: ${currentWarnings}`);

  const embed = new EmbedBuilder()
    .setTitle(`User ${action}`)
    .setColor(color)
    .addFields(
      { name: "Target", value: `<@${targetUser.id}> (${targetUser.tag || targetUser.id})`, inline: true },
      { name: "Moderator", value: `${modUser.tag ? `${modUser.tag} (${modUser.id})` : `<@${modUser.id}>`}`, inline: true }
    )
    .setTimestamp();

  if (lines.length) embed.setDescription(lines.join("\n"));
  try {
    return await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error("[Mod Log Error]", err);
    return null;
  }
}

module.exports = { sendModLog };
