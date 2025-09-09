// Shared leaderboard builders extracted from profile command for reuse
const { EmbedBuilder } = require('discord.js');
const theme = require('./theme');
const { applyFooterWithPagination } = require('./ui');

function computeEntries(levelsObj = {}) {
  return Object.entries(levelsObj).map(([userId, data]) => ({
    userId,
    xp: data?.xp || 0,
    level: data?.level || 0,
  }));
}

function sortEntries(entries) {
  return entries.sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
}

function computeRank(levelsObj, viewerId) {
  const entries = sortEntries(computeEntries(levelsObj));
  const idx = entries.findIndex(e => String(e.userId) === String(viewerId));
  return idx === -1 ? null : idx + 1;
}

function buildBankSection() {
  const { getTopBank } = require('./bank');
  const topBank = getTopBank(10) || [];
  const bankLines = topBank.map((e, i) => {
    const n = i + 1;
    const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `#${n}`;
    return `${medal} <@${e.userId}> — $${e.amount.toLocaleString()}`;
  });
  return `\n\n${theme.emojis.bank} Bank Leaderboard\n${bankLines.length ? bankLines.join('\n') : 'No balances yet.'}`;
}

function buildLeaderboardEmbed(guild, levelsObj, viewerId, page = 1, pageSize = 10, mode = 'text') {
  const entries = sortEntries(computeEntries(levelsObj));
  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page)));
  const start = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(start, start + pageSize);
  const lines = pageEntries.map((e, i) => {
    const rankNum = start + i + 1;
    const medal = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : `#${rankNum}`;
    const isYou = String(e.userId) === String(viewerId);
    const line = `${medal} <@${e.userId}> — Lv. ${e.level}`;
    return isYou ? `**${line} ← You**` : line;
  });
  const rank = computeRank(levelsObj, viewerId);
  const viewerOnPage = pageEntries.some(e => String(e.userId) === String(viewerId));
  const extraLine = !viewerOnPage && rank ? `\n— —\nYou: **#${rank}** <@${viewerId}>` : '';
  const bankSection = buildBankSection();
  const embed = new EmbedBuilder()
    .setTitle(mode === 'text' ? `${theme.emojis.leaderboard} Leaderboard` : `${theme.emojis.vc} VC Leaderboard`)
    .setColor(mode === 'text' ? theme.colors.warning : theme.colors.danger)
    .setDescription((lines.length ? lines.join('\n') + extraLine : 'No data yet.') + bankSection)
    .setTimestamp();
  const extraFooter = rank ? `Your rank: #${rank}` : null;
  applyFooterWithPagination(embed, guild, { testingMode: false, page: safePage, totalPages, extra: extraFooter });
  return embed;
}

module.exports = { buildLeaderboardEmbed, buildBankSection, computeRank };
