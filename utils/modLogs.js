const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");

// Only log moderation actions in the user action channel; testing mode uses test channel
const USER_ACTION_LOG_CHANNEL = "1232701768383729791";
const TEST_LOG_CHANNEL = "1413966369296220233";

/**
 * Logs moderation actions in the user action channel only
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').GuildMember|import('discord.js').User} target
 * @param {import('discord.js').User|{id:string,tag?:string}} moderator
 * @param {string} action - e.g. "muted", "unmuted", "banned", "warned", "warning removed"
 * @param {string|null} reason
 * @param {boolean} isPunishment
 * @param {string|null} duration - human readable (e.g., "1 hour")
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
  const isTest = !!config.testingMode;
  const channelId = isTest ? TEST_LOG_CHANNEL : (config.modLogChannelId || USER_ACTION_LOG_CHANNEL);
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  // Normalize objects
  const targetUser = target?.user || target;
  const modUser = moderator?.user || moderator;
  const targetId = targetUser?.id || target?.id || "Unknown";
  const modId = modUser?.id || moderator?.id || "Unknown";
  const targetTag = targetUser?.tag || targetUser?.username || targetId;
  const modTag = modUser?.tag || modUser?.username || modId;

  // Colors
  let color = 0x5865f2;
  const a = String(action || "").toLowerCase();
  if (a.includes("warn")) color = 0xffd700;
  if (a.includes("removed")) color = 0x00c853;
  if (a.includes("mute") || a.includes("ban") || a.includes("kick")) color = 0xff5555;

  const lines = [];
  if (reason) lines.push(`📝 Reason: ${reason}`);
  if (duration) lines.push(`⏰ Duration: ${duration}`);
  if (typeof currentWarnings === "number") lines.push(`⚠️ Warnings: ${currentWarnings}`);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: modTag, iconURL: modUser?.displayAvatarURL ? modUser.displayAvatarURL({ dynamic: true }) : undefined })
    .setTitle(targetTag)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Action", value: `**${action}**`, inline: true },
      { name: "Target", value: `<@${targetId}> (${targetId})`, inline: true },
      { name: "Moderator", value: `<@${modId}>`, inline: true }
    )
    .setTimestamp();

  const avatarUrl = targetUser?.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true, size: 1024 }) : null;
  if (avatarUrl) embed.setImage(avatarUrl);

  try {
    return await channel.send({ embeds: [embed] });
  } catch {
    return null;
  }
}

module.exports = { sendModLog };
