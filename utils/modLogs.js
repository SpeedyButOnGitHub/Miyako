const { EmbedBuilder } = require("discord.js");
const ms = require("ms");
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

  // Build a modern, stacked description similar to DM style
  // Extract any "warnings remaining until <punishment>" line from reason to place in footer (not for warn logs)
  let footerRemaining = null;
  let cleanReason = reason ? String(reason) : null;
  if (cleanReason) {
    const lines = cleanReason.split(/\n+/);
    const idx = lines.findIndex(l => /\b\d+\s+warning(s)?\s+remaining\s+until\s+(mute|kick)\b/i.test(l));
    if (idx !== -1 && a !== "warned") { // do not show remaining footer on warn logs
      footerRemaining = lines[idx].trim();
      lines.splice(idx, 1);
      cleanReason = lines.join("\n").trim();
    }
  }

  const descParts = [];
  if (cleanReason) {
    descParts.push(`📝 **Reason**\n${cleanReason}`);
  }
  if (duration) {
    descParts.push(`⏰ **Duration**\n${duration}`);
  }

  // Auto moderation note if this action itself is a mute/kick and we know the warnings count
  const bottomParts = [];
  const isAutoMute = a.includes("mute") && isPunishment && duration && typeof currentWarnings === "number";
  if (isAutoMute) {
    const durMs = typeof duration === "string" ? (ms(duration) || 0) : 0;
    const endTs = durMs > 0 ? `<t:${Math.floor((Date.now() + durMs) / 1000)}:R>` : null;
    bottomParts.push(`🚨 This user has been muted due to reaching ${currentWarnings} warning${currentWarnings === 1 ? "" : "s"}.${endTs ? `\n⏰ Ends ${endTs}` : ""}`);
  }
  const isAutoKick = a.includes("kick") && isPunishment && typeof currentWarnings === "number";
  if (isAutoKick) {
    bottomParts.push(`🚨 This user has been kicked due to reaching ${currentWarnings} warning${currentWarnings === 1 ? "" : "s"}.`);
  }

  const toTitleCase = (s) => String(s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1));
  let actionTitle = toTitleCase(action);
  actionTitle = actionTitle.replace(/\bX(\d+)\b/g, (m, n) => `x${n}`);

  const userObj = target?.user || target; // target can be GuildMember or User
  const displayName = target?.displayName || userObj?.username || `User ${target?.id || "Unknown"}`;
  const avatarURL = typeof userObj?.displayAvatarURL === "function"
    ? userObj.displayAvatarURL({ dynamic: true })
    : undefined;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: modTag, iconURL: modUser?.displayAvatarURL ? modUser.displayAvatarURL({ dynamic: true }) : undefined })
    .setTitle(targetTag)
    .setDescription([descParts.join("\n\n"), bottomParts.length ? bottomParts.join("\n\n") : null].filter(Boolean).join("\n\n"))
    .addFields(
      { name: "🧰 Action", value: `**${actionTitle}**`, inline: true },
      { name: "🎯 Target", value: `<@${targetId}>`, inline: true },
      { name: "🛡️ Moderator", value: `<@${modId}>`, inline: true }
    );

  // Always prefer a footer over timestamp; include emojis
  if (footerRemaining) {
    embed.setFooter({ text: `🧮 ${footerRemaining} • 🆔 ${targetId}` });
  } else {
    embed.setFooter({ text: `🆔 ${targetId}` });
  }

  const avatarUrl = targetUser?.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  try {
    return await channel.send({ embeds: [embed] });
  } catch {
    return null;
  }
}

module.exports = { sendModLog };
