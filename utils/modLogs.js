const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const ms = require("ms");
const { config } = require("./storage");
const theme = require("./theme");
const { createEmbed } = require('./embeds');
const { MOD_ACTION_LOG_CHANNEL, TEST_LOG_CHANNEL } = require("./logChannels");
const { applyStandardFooter } = require("./ui");

// Testing mode routes to test channel; otherwise prefer config.modLogChannelId, then MOD_ACTION_LOG_CHANNEL

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
  const channelId = isTest ? TEST_LOG_CHANNEL : (config.modLogChannelId || MOD_ACTION_LOG_CHANNEL);
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
  let color = theme.colors.primary;
  const a = String(action || "").toLowerCase();
  if (a.includes("warn")) color = theme.colors.warning;
  if (a.includes("removed")) color = theme.colors.success;
  if (a.includes("mute") || a.includes("ban") || a.includes("kick")) color = theme.colors.danger;

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

  const embed = createEmbed({
    color,
    title: targetTag,
    description: [descParts.join("\n\n"), bottomParts.length ? bottomParts.join("\n\n") : null].filter(Boolean).join("\n\n"),
    timestamp: false
  }).setAuthor({ name: modTag, iconURL: modUser?.displayAvatarURL ? modUser.displayAvatarURL({ dynamic: true }) : undefined });
  // keep explicit addFields order to preserve layout
  embed.addFields(
    { name: `${theme.emojis.action} Action`, value: `**${actionTitle}**`, inline: true },
    { name: `${theme.emojis.target} Target`, value: `<@${targetId}>`, inline: true },
    { name: `${theme.emojis.moderator} Moderator`, value: `<@${modId}>`, inline: true }
  );

  // Always prefer a footer over timestamp; include emojis
  if (footerRemaining) {
    embed.setFooter({ text: `${theme.emojis.counter} ${footerRemaining} • ${theme.emojis.id} ${targetId}` });
  } else {
    // Apply standard footer for server/testing context then append ID line
    applyStandardFooter(embed, channel.guild, { testingMode: config.testingMode });
    // Merge existing footer text with ID token
    const existing = embed.data.footer?.text || '';
    embed.setFooter({ text: `${existing}${existing ? ' • ' : ''}${theme.emojis.id} ${targetId}` });
  }

  const avatarUrl = targetUser?.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true, size: 256 }) : null;
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  // Staff-only quick-action buttons (compact: open submenus)
  const userIdSafe = String(targetId);
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`modact:menu:warnings:${userIdSafe}`).setLabel("Warnings").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.warn),
      new ButtonBuilder().setCustomId(`modact:menu:mute:${userIdSafe}`).setLabel("Mute").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.mute),
      new ButtonBuilder().setCustomId(`modact:init:kick:${userIdSafe}`).setLabel("Kick").setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.kick),
      new ButtonBuilder().setCustomId(`modact:init:ban:${userIdSafe}`).setLabel("Ban").setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.ban)
    )
  ];

  try {
  return await channel.send({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
  } catch {
    return null;
  }
}

module.exports = { sendModLog };
