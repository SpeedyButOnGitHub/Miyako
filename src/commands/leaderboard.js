const ActiveMenus = require('../utils/activeMenus');
const {
	buildLeaderboardEmbed: cachedLBEmbed,
	getEntries,
} = require('../services/leaderboardService');
const { buildRows } = require('./profile');

async function handleLeaderboardCommand(client, message) {
	const guild = message.guild;
	if (!guild) return;
	const member = message.member;
	if (!member) return;
	const mode = 'text'; // initial
	const page = 1;
	const embed = cachedLBEmbed(guild, member.id, page, 10, mode);
	const totalPages = Math.max(1, Math.ceil(getEntries(mode).length / 10));
	const rows = buildRows('leaderboard', page, totalPages, mode);
	const sent = await message
		.reply({ embeds: [embed], components: rows, allowedMentions: { repliedUser: false } })
		.catch(() => null);
	if (sent) {
		ActiveMenus.registerMessage(sent, {
			type: 'profile',
			userId: member.id,
			data: { view: 'leaderboard', page, mode },
		});
	}
}

module.exports = { handleLeaderboardCommand };
