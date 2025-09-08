const { EmbedBuilder } = require("discord.js");
<<<<<<< HEAD
const ms = require("ms");
const { config } = require("./storage");

// Only log moderation actions in the user action channel; testing mode uses test channel
const USER_ACTION_LOG_CHANNEL = "1232701768383729791";
=======
const { config } = require("./storage");

// Default mod log channel, overridden by config.modLogChannelId; tests route to TEST channel
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
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
<<<<<<< HEAD
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
=======
async function sendModLog(client, target, moderator, action, reason = null, isPunishment = true, duration = null, currentWarnings = null) {
  const channelId = config.testingMode ? TEST_LOG_CHANNEL : (config.modLogChannelId || "1232701768383729791");
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
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

  const main = [];
  const bottom = [];
  // Main details first
  if (reason) main.push(`📝 Reason: ${reason}`);
  if (duration) main.push(`⏰ Duration: ${duration}`);
  if (typeof currentWarnings === "number") main.push(`⚠️ Warnings: ${currentWarnings}`);
  // Auto moderation note and advanced info at the bottom
  const isAutoMute = a.includes("mute") && isPunishment && duration && typeof currentWarnings === "number";
  if (isAutoMute) {
    const durMs = typeof duration === "string" ? (ms(duration) || 0) : 0;
    const endTs = durMs > 0 ? `<t:${Math.floor((Date.now() + durMs) / 1000)}:R>` : null;
    bottom.push(`🚨 Due to reaching ${currentWarnings} warning${currentWarnings === 1 ? "" : "s"}, this user has been auto-muted for ${duration}${endTs ? ` (ends ${endTs})` : ""}.`);
  }
  // Kick case: when action text contains 'kicked' and we know warnings
  const isAutoKick = a.includes("kick") && isPunishment && typeof currentWarnings === "number";
  if (isAutoKick) {
    bottom.push(`🚨 Due to reaching ${currentWarnings} warning${currentWarnings === 1 ? "" : "s"}, this user has been auto-kicked.`);
  }
  bottom.push(`🔎 User ID: ${targetId}`);

  const toTitleCase = (s) => String(s || "").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.substr(1));
  const actionTitle = toTitleCase(action);

  const userObj = target?.user || target; // target can be GuildMember or User
  const displayName = target?.displayName || userObj?.username || `User ${target?.id || "Unknown"}`;
  const avatarURL = typeof userObj?.displayAvatarURL === "function"
    ? userObj.displayAvatarURL({ dynamic: true })
    : undefined;

  const embed = new EmbedBuilder()
<<<<<<< HEAD
=======
    .setAuthor({ name: displayName, iconURL: avatarURL })
    .setThumbnail(avatarURL)
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
    .setColor(color)
    .setAuthor({ name: modTag, iconURL: modUser?.displayAvatarURL ? modUser.displayAvatarURL({ dynamic: true }) : undefined })
    .setTitle(targetTag)
    .setDescription([main.join("\n"), bottom.length ? "\n" + bottom.join("\n") : null].filter(Boolean).join(""))
    .addFields(
      { name: "Action", value: `**${actionTitle}**` },
      { name: "Target", value: `<@${targetId}>` },
      { name: "Moderator", value: `<@${modId}>` }
    )
    .setTimestamp();

  const avatarUrl = targetUser?.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  try {
    return await channel.send({ embeds: [embed] });
  } catch {
    return null;
  }
}

module.exports = { sendModLog };
