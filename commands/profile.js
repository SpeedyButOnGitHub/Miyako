const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { getXP, getLevel } = require("../utils/levels");
const { getUserModifier } = require("../utils/leveling");
const { config } = require("../utils/storage");

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
  return Math.floor(50 * Math.pow(level, 1 / 0.7));
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

function collectUserPermissions(member) {
  // Aggregate configured levelRewards and match against member roles
  const rewards = config.levelRewards || {};
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

function buildRows(view = "main") {
  // Main profile: only View Rank + Leaderboard (no Back)
  if (view === "main") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prof_rank").setLabel("View Rank").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("prof_lb").setLabel("Leaderboard").setStyle(ButtonStyle.Secondary)
      )
    ];
  }
  // Rank view: Back + Leaderboard
  if (view === "rank") {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prof_back").setLabel("Back").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("prof_lb").setLabel("Leaderboard").setStyle(ButtonStyle.Primary)
      )
    ];
  }
  // Leaderboard view: Back + View Rank
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("prof_back").setLabel("Back").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("prof_rank").setLabel("View Rank").setStyle(ButtonStyle.Primary)
    )
  ];
}

function buildRankEmbed(member, rank, level, progressBar) {
  return new EmbedBuilder()
    .setTitle("📊 Your Rank")
    .setColor(0x5865F2)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: "Level", value: `\`Lv. ${level}\``, inline: true },
      { name: "Rank", value: rank ? `#${rank}` : "—", inline: true },
      { name: "Progress", value: `${progressBar}`, inline: false },
    )
    .setTimestamp();
}

function buildLeaderboardEmbed(guild, levelsObj, viewerId) {
  const entries = Object.entries(levelsObj || {}).map(([uid, data]) => ({
    userId: uid,
    xp: data?.xp || 0,
    level: data?.level || 0,
  }));
  entries.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const top = entries.slice(0, 10);
  const lines = top.map((e, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    return `${medal} <@${e.userId}> — Lv. ${e.level}`;
  });
  const rank = getRankFromLeaderboard(levelsObj, viewerId);
  return new EmbedBuilder()
    .setTitle("🏆 Leaderboard")
    .setColor(0xF1C40F)
    .setDescription(lines.length ? lines.join("\n") : "No data yet.")
    .setFooter({ text: rank ? `Your rank: #${rank}` : "" })
    .setTimestamp();
}

async function handleProfileCommand(client, message) {
  const member = message.member;
  if (!member) return; // Ensure member is defined

  const userId = member.id;
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

  const userPerms = collectUserPermissions(member);
  const permsDisplay = formatPermissionPhrases(userPerms);

  const embed = new EmbedBuilder()
    .setColor(0x00B2FF)
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
  const upcoming = Object.keys(config.levelRewards || {})
    .map(n => Number(n)).filter(n => Number.isFinite(n) && n > level)
    .sort((a,b) => a-b)[0];
  if (upcoming) {
    const roles = config.levelRewards[String(upcoming)];
    const roleIds = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    if (roleIds.length) {
      const mentions = roleIds.map(id => `<@&${id}>`).join(", ");
      embed.addFields({ name: "Next Unlock", value: `Level ${upcoming}: ${mentions}`, inline: false });
    }
  }

  // Send with buttons and add a collector to switch views
  const sent = await message.reply({ embeds: [embed], components: buildRows("main") });

  const filter = (i) => i.user.id === message.author.id && ["prof_rank", "prof_lb", "prof_back"].includes(i.customId);
  const collector = sent.createMessageComponentCollector({ filter, time: 60_000 });

  collector.on("collect", async (interaction) => {
    try {
      if (interaction.customId === "prof_lb") {
        const levelsObj = require("../utils/levels").levels;
        const lbEmbed = buildLeaderboardEmbed(message.guild, levelsObj, message.author.id);
        return interaction.update({ embeds: [lbEmbed], components: buildRows("leaderboard") });
      }
      if (interaction.customId === "prof_rank") {
        const uid = member.id;
        const xp2 = getXP(uid);
        const lvl2 = getLevel(uid);
        const next2 = lvl2 + 1;
        const xpNext2 = getLevelXP(next2);
        const xpCurr2 = getLevelXP(lvl2);
        const into2 = Math.max(0, xp2 - xpCurr2);
        const need2 = Math.max(1, xpNext2 - xpCurr2);
        const bar2 = createProgressBar(into2, need2, 20);
        const rank2 = getRankFromLeaderboard(require("../utils/levels").levels, uid);
        const rankEmbed = buildRankEmbed(member, rank2, lvl2, bar2);
        return interaction.update({ embeds: [rankEmbed], components: buildRows("rank") });
      }
      // Back -> show profile again (recompute in case it changed)
      const uid = member.id;
      const xp2 = getXP(uid);
      const lvl2 = getLevel(uid);
      const next2 = lvl2 + 1;
      const xpNext2 = getLevelXP(next2);
      const xpCurr2 = getLevelXP(lvl2);
      const into2 = Math.max(0, xp2 - xpCurr2);
      const need2 = Math.max(1, xpNext2 - xpCurr2);
      const bar2 = createProgressBar(into2, need2, 20);
      const rank2 = getRankFromLeaderboard(require("../utils/levels").levels, uid);
      const modUser2 = getUserModifier(uid) || 1.0;
      const global2 = typeof config.globalXPMultiplier === "number" ? config.globalXPMultiplier : 1.0;
      const eff2 = Math.max(0, +(modUser2 * global2).toFixed(2));
      const upcoming2 = Object.keys(config.levelRewards || {})
        .map(n => Number(n)).filter(n => Number.isFinite(n) && n > lvl2)
        .sort((a,b) => a-b)[0];
      const profEmbed = new EmbedBuilder()
        .setColor(0x00B2FF)
        .setAuthor({ name: `${member.user.tag}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTitle("Your profile")
        .addFields(
          { name: "Level", value: `\`Lv. ${lvl2}\``, inline: true },
          { name: "Rank", value: rank2 ? `#${rank2}` : "—", inline: true },
          { name: "XP Modifier", value: `x${eff2.toFixed(2)}`, inline: true },
        )
        .addFields(
          { name: "Progress", value: `${bar2}`, inline: false },
          { name: "Unlocked Perks", value: formatPermissionPhrases(collectUserPermissions(member)), inline: false },
        )
        .setFooter({ text: member.guild.name })
        .setTimestamp();
      if (upcoming2) {
        const roles2 = config.levelRewards[String(upcoming2)];
        const roleIds2 = Array.isArray(roles2) ? roles2 : (roles2 ? [roles2] : []);
        if (roleIds2.length) {
          const mentions2 = roleIds2.map(id => `<@&${id}>`).join(", ");
          profEmbed.addFields({ name: "Next Unlock", value: `Level ${upcoming2}: ${mentions2}`, inline: false });
        }
      }
      return interaction.update({ embeds: [profEmbed], components: buildRows("main") });
    } catch (err) {
      console.error("[profile collector]", err);
    }
  });

  collector.on("end", async () => {
    try {
      const disabled = buildRows("main");
      disabled.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
      await sent.edit({ components: disabled });
    } catch {}
  });
}

module.exports = { handleProfileCommand };
