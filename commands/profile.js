const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getXP, getLevel } = require("../utils/levels");
const { getVCXP, getVCLevel, vcLevels } = require("../utils/vcLevels");
const { getUserModifier } = require("../utils/leveling");
const { config } = require("../utils/storage");
const ActiveMenus = require("../utils/activeMenus");
const theme = require("../utils/theme");

// Map configured level reward roles to human-friendly labels
const PERMISSION_ROLE_LABELS = {
  "1232701768354369551": "Links",
  "1403501108151975966": "DJ",
  "1232701768354369552": "Images",
};
// Phrases to display in the Profile for owned permissions (not role mentions)
const PERMISSION_ROLE_PHRASES = {
  "1232701768354369551": "Link permissions",
  "1403501108151975966": "DJ permissions",
  "1232701768354369552": "Image permissions",
};

function getLevelXP(level) {
  const BASE_XP = 150; // keep in sync with utils/levels
  return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

function createProgressBar(current, max, size = 18) {
  const safeMax = Math.max(1, max);
  const filled = Math.min(size, Math.max(0, Math.round((current / safeMax) * size)));
  const empty = size - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${current}/${max}`;
}

function getRankFromLeaderboard(levelsObj, userId) {
  const entries = Object.entries(levelsObj || {}).map(([uid, data]) => ({
    userId: uid,
    xp: data?.xp || 0,
    level: data?.level || 0,
  }));
  entries.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const idx = entries.findIndex(e => e.userId === userId);
  return idx === -1 ? null : idx + 1;
}

function collectUserPermissions(member, mode = "text") {
  // Aggregate configured rewards and match against member roles
  const rewards = mode === "vc" ? (config.vcLevelRewards || {}) : (config.levelRewards || {});
  const perms = [];
  for (const [level, roleIdsOrArray] of Object.entries(rewards)) {
    const roleIds = Array.isArray(roleIdsOrArray) ? roleIdsOrArray : (roleIdsOrArray ? [roleIdsOrArray] : []);
    for (const roleId of roleIds) {
      if (member.roles.cache.has(roleId)) {
        const label = PERMISSION_ROLE_LABELS[roleId] || (member.guild.roles.cache.get(roleId)?.name ?? roleId);
        perms.push({ roleId, label, level: Number(level) || 0 });
      }
    }
  }
  perms.sort((a,b) => a.level - b.level || a.label.localeCompare(b.label));
  return perms;
}

function formatPermissionPhrases(perms) {
  // Convert owned permission roles to short phrases and render as achievement-style lines
  const phrasesSet = new Set();
  for (const p of perms) {
    const phrase = PERMISSION_ROLE_PHRASES[p.roleId];
    if (phrase) phrasesSet.add(phrase);
  }
  const phrases = Array.from(phrasesSet);
  const order = ["Image permissions", "Link permissions", "DJ permissions"]; // stable nice order
  phrases.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (phrases.length === 0) return "*None unlocked yet*";
  const emojiMap = { "Image permissions": "🖼️", "Link permissions": "🔗", "DJ permissions": "🎧" };
  return phrases.map(ph => `${emojiMap[ph] || "🏅"} ${ph}`).join("\n");
}

function buildRows(view = "main", page = 1, totalPages = 1, mode = "text") {
  const isProfile = view === "main" || view === "profile";
  const isRank = view === "rank";
  const isLB = view === "leaderboard";
  const top = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("prof_home").setLabel("👤 Profile").setStyle(isProfile ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("prof_rank").setLabel("📊 Rank").setStyle(isRank ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("prof_lb").setLabel("🏆 Leaderboard").setStyle(isLB ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("prof_toggle_mode")
      .setLabel(mode === "text" ? "🎙️ VC Mode" : "💬 Text Mode")
      .setStyle(mode === "text" ? ButtonStyle.Secondary : ButtonStyle.Success)
  );
  if (!isLB) return [top];
  const prev = new ButtonBuilder().setCustomId("lb_prev").setLabel("◀ Prev").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1);
  const pageBtn = new ButtonBuilder().setCustomId("lb_page").setLabel(`Page ${page}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
  const next = new ButtonBuilder().setCustomId("lb_next").setLabel("Next ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages);
  const bottom = new ActionRowBuilder().addComponents(prev, pageBtn, next);
  return [top, bottom];
}

function buildRankEmbed(member, rank, level, progressBar, mode = "text") {
  return new EmbedBuilder()
    .setTitle(mode === "text" ? "📊 Your Rank" : "🎙️ Your VC Rank")
  .setColor(mode === "text" ? theme.colors.primary : theme.colors.danger)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: "Level", value: `\`Lv. ${level}\``, inline: true },
      { name: "Rank", value: rank ? `#${rank}` : "—", inline: true },
      { name: "Progress", value: `${progressBar}`, inline: false },
    )
    .setTimestamp();
}

function buildLeaderboardEmbed(guild, levelsObj, viewerId, page = 1, pageSize = 10, mode = "text") {
  const entries = Object.entries(levelsObj || {}).map(([uid, data]) => ({
    userId: uid,
    xp: data?.xp || 0,
    level: data?.level || 0,
  }));
  entries.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page)));
  const start = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);
  const lines = pageEntries.map((e, i) => {
    const rankNum = start + i + 1;
    const medal = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : `#${rankNum}`;
    const isYou = String(e.userId) === String(viewerId);
    const line = `${medal} <@${e.userId}> — Lv. ${e.level}`;
    return isYou ? `**${line} ← You**` : line;
  });
  const rank = getRankFromLeaderboard(levelsObj, viewerId);
  const viewerOnPage = pageEntries.some(e => String(e.userId) === String(viewerId));
  const extra = !viewerOnPage && rank
    ? `\n— —\nYou: **#${rank}** <@${viewerId}>`
    : "";
  return new EmbedBuilder()
    .setTitle(mode === "text" ? "🏆 Leaderboard" : "🎙️ VC Leaderboard")
  .setColor(mode === "text" ? theme.colors.warning : theme.colors.danger)
    .setDescription(lines.length ? lines.join("\n") + extra : "No data yet.")
    .setFooter({ text: rank ? `Your rank: #${rank} • Page ${safePage}/${totalPages}` : `Page ${safePage}/${totalPages}` })
    .setTimestamp();
}

async function handleProfileCommand(client, message) {
  const member = message.member;
  if (!member) return; // Ensure member is defined

  const userId = member.id;
  const mode = "text"; // initial
  const xp = getXP(userId);
  const level = getLevel(userId);
  const nextLevel = level + 1;
  const xpForNextLevel = getLevelXP(nextLevel);
  const xpForCurrentLevel = getLevelXP(level);
  const xpIntoLevel = Math.max(0, xp - xpForCurrentLevel);
  const xpNeeded = Math.max(1, xpForNextLevel - xpForCurrentLevel);
  const progressBar = createProgressBar(xpIntoLevel, xpNeeded, 20);

  const modifier = getUserModifier(userId) * (Number.isFinite(config.globalXPMultiplier) ? config.globalXPMultiplier : 1);
  const effective = Math.max(0, modifier);

  // Determine rank position from levels.json data
  const levels = require("../utils/levels").levels; // Adjusted to match original context
  const rank = getRankFromLeaderboard(levels, userId);

  const userPerms = collectUserPermissions(member, mode);
  const permsDisplay = formatPermissionPhrases(userPerms);

  const embed = new EmbedBuilder()
    .setColor(theme.colors.primary)
    .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTitle("Your profile")
    .addFields(
      { name: "Level", value: `\`Lv. ${level}\``, inline: true },
      { name: "Rank", value: rank ? `#${rank}` : "—", inline: true },
      { name: "XP Modifier", value: `x${effective.toFixed(2)}`, inline: true },
    )
    .addFields(
      { name: "Progress", value: `${progressBar}`, inline: false },
      { name: "Unlocked Perks", value: permsDisplay, inline: false },
    )
    .setFooter({ text: member.guild.name })
    .setTimestamp();

  // Optional: show next unlock preview
  const rewardsMap = mode === "vc" ? (config.vcLevelRewards || {}) : (config.levelRewards || {});
  const upcoming = Object.keys(rewardsMap || {})
    .map(n => Number(n)).filter(n => Number.isFinite(n) && n > level)
    .sort((a,b) => a-b)[0];
  if (upcoming) {
    const roles = rewardsMap[String(upcoming)];
    const roleIds = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    if (roleIds.length) {
      const mentions = roleIds.map(id => `<@&${id}>`).join(", ");
      embed.addFields({ name: "Next Unlock", value: `Level ${upcoming}: ${mentions}`, inline: false });
    }
  }

  // Send and register a persistent session. Handling is done in ActiveMenus.registerHandler below.
  const sent = await message.reply({ embeds: [embed], components: buildRows("main", 1, 1, mode) });
  ActiveMenus.registerMessage(sent, { type: "profile", userId: message.author.id, data: { view: "main", mode } });
}

// Global handler for profile sessions
const { levels: levelsObj } = require("../utils/levels");
ActiveMenus.registerHandler("profile", async (interaction, session) => {
  const member = interaction.member;
  if (!member || (session.userId && member.id !== session.userId)) {
    try { await interaction.reply({ content: "Only the original user can use this menu.", ephemeral: true }); } catch {}
    return;
  }
  const uid = member.id;
  const mode = session?.data?.mode === "vc" ? "vc" : "text";
  const xp = mode === "vc" ? getVCXP(uid) : getXP(uid);
  const lvl = mode === "vc" ? getVCLevel(uid) : getLevel(uid);
  const next = lvl + 1;
  const xpNext = getLevelXP(next);
  const xpCurr = getLevelXP(lvl);
  const into = Math.max(0, xp - xpCurr);
  const need = Math.max(1, xpNext - xpCurr);
  const bar = createProgressBar(into, need, 20);
  const levelsSource = session?.data?.levelsOverride || (mode === "vc" ? vcLevels : levelsObj);
  const rank = getRankFromLeaderboard(levelsSource, uid);

  if (interaction.customId === "prof_toggle_mode") {
    session.data.mode = mode === "vc" ? "text" : "vc";
    // Re-render current view in new mode
    const m = session.data.mode;
    const source = m === "vc" ? vcLevels : levelsObj;
    const userXP = m === "vc" ? getVCXP(uid) : getXP(uid);
    const userLvl = m === "vc" ? getVCLevel(uid) : getLevel(uid);
    const next = userLvl + 1;
    const xpNext = getLevelXP(next);
    const xpCurr = getLevelXP(userLvl);
    const into = Math.max(0, userXP - xpCurr);
    const need = Math.max(1, xpNext - xpCurr);
    const bar = createProgressBar(into, need, 20);
    const r = getRankFromLeaderboard(source, uid);
    let embed;
  if (session.data.view === "leaderboard") {
      const page = Number(session.data.page) || 1;
      const totalPages = Math.max(1, Math.ceil(Object.keys(source || {}).length / 10));
      embed = buildLeaderboardEmbed(interaction.guild, source, uid, Math.min(page, totalPages), 10, m);
      await interaction.update({ embeds: [embed], components: buildRows("leaderboard", Math.min(page, totalPages), totalPages, m) });
      return;
  } else if (session.data.view === "rank") {
      embed = buildRankEmbed(member, r, userLvl, bar, m);
      await interaction.update({ embeds: [embed], components: buildRows("rank", 1, 1, m) });
      return;
    } else {
      // profile
      const userMod = getUserModifier(uid) || 1.0;
      const globalMod = typeof config.globalXPMultiplier === "number" ? config.globalXPMultiplier : 1.0;
      const eff = Math.max(0, +(userMod * globalMod).toFixed(2));
      const pEmbed = new EmbedBuilder()
        .setColor(m === "text" ? theme.colors.primary : theme.colors.danger)
        .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTitle(m === "text" ? "Your profile" : "Your VC profile")
        .addFields(
          { name: "Level", value: `\`Lv. ${userLvl}\``, inline: true },
          { name: "Rank", value: r ? `#${r}` : "—", inline: true },
          { name: m === "text" ? "XP Modifier" : "VC XP Modifier", value: `x${eff.toFixed(2)}`, inline: true },
        )
        .addFields(
          { name: "Progress", value: `${bar}`, inline: false },
          { name: "Unlocked Perks", value: formatPermissionPhrases(collectUserPermissions(member, m)), inline: false },
        )
        .setFooter({ text: member.guild.name })
        .setTimestamp();
      // Next Unlock for the current mode after toggle
      const rewardsMapToggle = m === "vc" ? (config.vcLevelRewards || {}) : (config.levelRewards || {});
      const nextTier = Object.keys(rewardsMapToggle)
        .map(n => Number(n)).filter(n => Number.isFinite(n) && n > userLvl)
        .sort((a,b) => a-b)[0];
      if (nextTier) {
        const rids = rewardsMapToggle[String(nextTier)];
        const ids = Array.isArray(rids) ? rids : (rids ? [rids] : []);
        if (ids.length) {
          const mentions = ids.map(id => `<@&${id}>`).join(", ");
          pEmbed.addFields({ name: "Next Unlock", value: `Level ${nextTier}: ${mentions}`, inline: false });
        }
      }
      await interaction.update({ embeds: [pEmbed], components: buildRows("main", 1, 1, m) });
      return;
    }
  }
  if (interaction.customId === "prof_lb") {
    const page = 1;
    const src = session?.data?.levelsOverride || (mode === "vc" ? vcLevels : levelsObj);
    const lbEmbed = buildLeaderboardEmbed(interaction.guild, src, uid, page, 10, mode);
    session.data.view = "leaderboard";
    session.data.page = page;
    const totalPages = Math.max(1, Math.ceil(Object.keys(src || {}).length / 10));
    await interaction.update({ embeds: [lbEmbed], components: buildRows("leaderboard", page, totalPages, mode) });
    return;
  }
  if (interaction.customId === "lb_prev" || interaction.customId === "lb_next") {
    const src = session?.data?.levelsOverride || (mode === "vc" ? vcLevels : levelsObj);
    const totalPages = Math.max(1, Math.ceil(Object.keys(src || {}).length / 10));
    let page = Number(session.data.page) || 1;
    page += interaction.customId === "lb_next" ? 1 : -1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    session.data.page = page;
    const lbEmbed = buildLeaderboardEmbed(interaction.guild, src, uid, page, 10, mode);
    await interaction.update({ embeds: [lbEmbed], components: buildRows("leaderboard", page, totalPages, mode) });
    return;
  }
  if (interaction.customId === "prof_rank") {
    const rEmbed = buildRankEmbed(member, rank, lvl, bar, mode);
    session.data.view = "rank";
    await interaction.update({ embeds: [rEmbed], components: buildRows("rank", 1, 1, mode) });
    return;
  }
  // prof_home
  const userMod = getUserModifier(uid) || 1.0;
  const globalMod = typeof config.globalXPMultiplier === "number" ? config.globalXPMultiplier : 1.0;
  const eff = Math.max(0, +(userMod * globalMod).toFixed(2));
  const rewardsForMode = mode === "vc" ? (config.vcLevelRewards || {}) : (config.levelRewards || {})
  const upcoming = Object.keys(rewardsForMode || {})
    .map(n => Number(n)).filter(n => Number.isFinite(n) && n > lvl)
    .sort((a,b) => a-b)[0];
  const pEmbed = new EmbedBuilder()
    .setColor(mode === "text" ? theme.colors.primary : theme.colors.danger)
    .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTitle(mode === "text" ? "Your profile" : "Your VC profile")
    .addFields(
      { name: "Level", value: `\`Lv. ${lvl}\``, inline: true },
      { name: "Rank", value: rank ? `#${rank}` : "—", inline: true },
      { name: "XP Modifier", value: `x${eff.toFixed(2)}`, inline: true },
    )
    .addFields(
      { name: "Progress", value: `${bar}`, inline: false },
      { name: "Unlocked Perks", value: formatPermissionPhrases(collectUserPermissions(member)), inline: false },
    )
    .setFooter({ text: member.guild.name })
    .setTimestamp();
  if (upcoming) {
    const roles = rewardsForMode[String(upcoming)];
    const roleIds = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    if (roleIds.length) {
      const mentions = roleIds.map(id => `<@&${id}>`).join(", ");
      pEmbed.addFields({ name: "Next Unlock", value: `Level ${upcoming}: ${mentions}`, inline: false });
    }
  }
  session.data.view = "main";
  await interaction.update({ embeds: [pEmbed], components: buildRows("main", 1, 1, mode) });
});

module.exports = { handleProfileCommand, buildLeaderboardEmbed, buildRows };
