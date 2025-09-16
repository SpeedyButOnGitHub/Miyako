const { getXP, getLevel, levels: levelsObj } = require('../utils/levels');
const ActiveMenus = require('../utils/activeMenus');
const { buildRows, buildRankEmbed } = require('./profile');
const { EmbedBuilder } = require('discord.js');
const theme = require('../utils/theme');

function getLevelXP(level) {
	const BASE_XP = 150; // keep in sync with utils/levels addXP
	return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

function createProgressBar(current, max, size = 20) {
	const { progressBar } = require('../ui');
	return progressBar(current, max, size, { showNumbers: true, allowOverflow: false });
}

async function handleLevelCommand(client, message) {
	const userId = message.author.id;
	const xp = getXP(userId);
	const level = getLevel(userId);
	const nextLevel = level + 1;
	const xpForNextLevel = getLevelXP(nextLevel);
	const xpForCurrentLevel = getLevelXP(level);
	const xpIntoLevel = Math.max(0, xp - xpForCurrentLevel);
	const xpNeeded = Math.max(1, xpForNextLevel - xpForCurrentLevel);

	const progressBar = createProgressBar(xpIntoLevel, xpNeeded, 24);
	// Determine rank from levels
	const rank = (() => {
		const entries = Object.entries(levelsObj || {}).map(([uid, data]) => ({
			uid,
			lvl: data?.level || 0,
			xp: data?.xp || 0,
		}));
		entries.sort((a, b) => b.lvl - a.lvl || b.xp - a.xp);
		const i = entries.findIndex((e) => e.uid === userId);
		return i === -1 ? null : i + 1;
	})();

	let embed;
	if (buildRankEmbed) {
		embed = buildRankEmbed(message.member, rank, level, progressBar, 'text');
	} else {
		embed = new EmbedBuilder()
			.setTitle(`${theme.emojis.rank} Your Rank`)
			.setColor(theme.colors.primary)
			.addFields(
				{ name: 'Level', value: `Lv. ${level}`, inline: true },
				{ name: 'Rank', value: rank ? `#${rank}` : '—', inline: true },
				{ name: 'Progress', value: progressBar, inline: false },
			)
			.setTimestamp();
	}

	const rows = buildRows('rank', 1, 1, 'text');
	const sent = await message
		.reply({ embeds: [embed], components: rows, allowedMentions: { repliedUser: false } })
		.catch(() => null);
	if (sent) {
		ActiveMenus.registerMessage(sent, {
			type: 'profile',
			userId: message.author.id,
			data: { view: 'rank', mode: 'text' },
		});
	}
}

module.exports = { handleLevelCommand };
