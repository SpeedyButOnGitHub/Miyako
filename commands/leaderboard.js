const { EmbedBuilder } = require("discord.js");
const { config } = require("../utils/storage");
const { levels } = require("../utils/levels");

function createProgressBar(current, max, size = 12) {
  const safeMax = Math.max(1, max);
  const filled = Math.min(size, Math.max(0, Math.round((current / safeMax) * size)));
  const empty = size - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${current}/${max}`;
}

function getLevelXP(level) {
  return Math.floor(50 * Math.pow(level, 1 / 0.7));
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
    const n = Math.min(10, pool.length);
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
  const top = entries.slice(0, 10);

  if (top.length === 0) {
    await message.reply("No leaderboard data yet.");
    return;
  }

  // Build lines
  const lines = await Promise.all(top.map(async (e, idx) => {
    const member = await guild.members.fetch(e.userId).catch(() => null);
    const name = member ? member.user.tag : `User ${e.userId}`;
    const curLevelXP = getLevelXP(e.level);
    const nextLevelXP = getLevelXP(e.level + 1);
    const into = Math.max(0, e.xp - curLevelXP);
    const need = Math.max(1, nextLevelXP - curLevelXP);
    const bar = createProgressBar(into, need, 14);
    return `**${idx + 1}.** ${member ? `<@${e.userId}>` : name} — Lvl ${e.level} • ${bar}`;
  }));

  const embed = new EmbedBuilder()
    .setTitle("🏆 Server Leaderboard")
    .setColor(0x5865F2)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = { handleLeaderboardCommand };
