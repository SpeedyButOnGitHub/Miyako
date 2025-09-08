const { EmbedBuilder } = require("discord.js");
const { config } = require("../utils/storage");
const { levels } = require("../utils/levels");
const ActiveMenus = require("../utils/activeMenus");
const { buildLeaderboardEmbed, buildRows } = require("./profile");
const theme = require("../utils/theme");

function createProgressBar(current, max, size = 14) {
  const safeMax = Math.max(1, max);
  const filled = Math.min(size, Math.max(0, Math.round((current / safeMax) * size)));
  const empty = size - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${current}/${max}`;
}

function getLevelXP(level) {
  const BASE_XP = 150;
  return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function handleLeaderboardCommand(client, message) {
  const guild = message.guild;
  if (!guild) return;

  // Build a list of users with levels
  let entries = Object.entries(levels).map(([userId, data]) => ({
    userId,
    xp: data?.xp || 0,
    level: data?.level || 0,
  }));

  // Testing mode: fabricate a randomized leaderboard from guild members
  if (config.testingMode) {
    let pool = [];
    try {
      const members = await guild.members.fetch();
      pool = members.filter(m => !m.user.bot).map(m => m.id);
    } catch (e) {
      // Fallback to cache to avoid requiring privileged member intents
      pool = guild.members.cache.filter(m => !m.user.bot).map(m => m.id);
    }
    if (!pool.length) {
      // Last resort: use existing level keys present
      pool = Object.keys(levels);
    }
    const n = Math.min(50, pool.length);
    const chosen = new Set();
    while (chosen.size < n && chosen.size < pool.length) chosen.add(pickRandom(pool));
    entries = Array.from(chosen).map(userId => {
      const level = Math.floor(Math.random() * 75) + 1; // 1 - 75
      const curLevelXP = getLevelXP(level);
      const nextLevelXP = getLevelXP(level + 1);
      const xpIntoLevel = Math.floor(Math.random() * Math.max(1, nextLevelXP - curLevelXP));
      const xp = curLevelXP + xpIntoLevel;
      return { userId, level, xp };
    });
  }

  // Sort by level desc, then xp desc
  entries.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));

  const viewerId = message.author.id;
  const dataset = config.testingMode
    ? entries.reduce((acc, e) => { acc[e.userId] = { level: e.level, xp: e.xp }; return acc; }, {})
    : require("../utils/levels").levels; // ensure fresh reference
  const totalPages = Math.max(1, Math.ceil(Object.keys(dataset || {}).length / 10));
  let page = 1;
  const args = (message.content || "").slice(1).trim().split(/\s+/).slice(1);
  if (args[0]) {
    const p = Number(args[0]);
    if (Number.isFinite(p) && p > 0) page = Math.floor(p);
  }
  if (page > totalPages) page = totalPages;

  const embed = buildLeaderboardEmbed(guild, dataset, viewerId, page, 10);
  const rows = buildRows("leaderboard", page, totalPages);
  const sent = await message.reply({ embeds: [embed], components: rows }).catch(() => null);
  if (sent) {
    ActiveMenus.registerMessage(sent, { type: "profile", userId: message.author.id, data: { view: "leaderboard", page, levelsOverride: config.testingMode ? dataset : undefined } });
  }
}

module.exports = { handleLeaderboardCommand };
