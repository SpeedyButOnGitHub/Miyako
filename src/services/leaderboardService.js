// leaderboardService: caches sorted level leaderboards (text + VC) for short TTL to reduce sort cost
// Provides buildLeaderboardEmbed(guild, viewerId, page, pageSize, mode)
// Mode: 'text' | 'vc'

const { createEmbed } = require('../utils/embeds');
const theme = require('../utils/theme');
const { applyFooterWithPagination } = require('../utils/ui');
const { levels, vcLevels } = require('./levelingService');
const { getTopBank } = require('../utils/bank');

const CACHE_TTL_MS = 5000; // 5s window; can also be explicitly invalidated when XP changes
const caches = { text: { expires: 0, entries: [], dirty: false }, vc: { expires: 0, entries: [], dirty: false } };

function buildEntries(mode) {
	const src = mode === 'vc' ? vcLevels : levels;
	return Object.entries(src || {}).map(([userId, data]) => ({
		userId,
		xp: data?.xp || 0,
		level: data?.level || 0
	})).sort((a,b) => (b.level - a.level) || (b.xp - a.xp));
}

function getEntries(mode = 'text') {
	const key = mode === 'vc' ? 'vc' : 'text';
	const now = Date.now();
	const cache = caches[key];
	if (cache.expires < now || cache.dirty) {
		cache.entries = buildEntries(key === 'vc' ? 'vc' : 'text');
		cache.expires = now + CACHE_TTL_MS;
		cache.dirty = false;
	}
	return cache.entries;
}

function computeRank(mode, viewerId) {
	const entries = getEntries(mode);
	const idx = entries.findIndex(e => String(e.userId) === String(viewerId));
	return idx === -1 ? null : idx + 1;
}

function buildBankSection() {
	const topBank = getTopBank(10) || [];
	const bankLines = topBank.map((e, i) => {
		const n = i + 1;
		const medal = n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : `#${n}`;
		return `${medal} <@${e.userId}> — $${e.amount.toLocaleString()}`;
	});
	return `\n\n${theme.emojis.bank} Bank Leaderboard\n${bankLines.length ? bankLines.join('\n') : 'No balances yet.'}`;
}

function buildLeaderboardEmbed(guild, viewerId, page = 1, pageSize = 10, mode = 'text') {
	const entries = getEntries(mode);
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
	const rank = computeRank(mode, viewerId);
	const viewerOnPage = pageEntries.some(e => String(e.userId) === String(viewerId));
	const extraLine = !viewerOnPage && rank ? `\n— —\nYou: **#${rank}** <@${viewerId}>` : '';
	const bankSection = buildBankSection();
	const embed = createEmbed({
		title: mode === 'vc' ? `${theme.emojis.vc} VC Leaderboard` : `${theme.emojis.leaderboard} Leaderboard`,
		description: (lines.length ? lines.join('\n') + extraLine : 'No data yet.') + bankSection,
		color: mode === 'vc' ? theme.colors.danger : theme.colors.warning
	});
	const extraFooter = rank ? `Your rank: #${rank}` : null;
	applyFooterWithPagination(embed, guild, { testingMode: false, page: safePage, totalPages, extra: extraFooter });
	return embed;
}

function invalidate(mode = 'both') {
	if (mode === 'both' || mode === 'text') caches.text.dirty = true;
	if (mode === 'both' || mode === 'vc') caches.vc.dirty = true;
}

module.exports = { getEntries, computeRank, buildLeaderboardEmbed, invalidate };
