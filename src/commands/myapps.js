// User submission history command (.myapps)
// Lists recent application submissions and their statuses.

const { listSubmissions, getApplication } = require('../utils/applications');
const { createEmbed, safeAddField } = require('../utils/embeds');

async function handleMyAppsCommand(client, message) {
	try {
		const userId = message.author.id;
		const subs = listSubmissions({})
			.filter((s) => s.userId === userId)
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, 10);
		if (!subs.length) {
			return message.reply({ content: 'You have no application submissions yet.' });
		}
		const e = createEmbed({
			title: 'My Applications',
			description: `Showing latest ${subs.length} submission(s).`,
		});
		const statusEmoji = (s) =>
			s === 'pending' ? '⏳' : s === 'accepted' ? '✅' : s === 'denied' ? '❌' : '•';
		for (const sub of subs) {
			const app = getApplication(sub.appId) || { name: `App ${sub.appId}` };
			const age = formatRelative(sub.createdAt);
			const decided = sub.decidedAt
				? ` — decided ${formatRelative(sub.decidedAt)} by ${sub.decidedBy ? `<@${sub.decidedBy}>` : 'unknown'}`
				: '';
			safeAddField(
				e,
				`${statusEmoji(sub.status)} ${app.name}`,
				`ID: #${sub.id} • ${sub.status}${decided}\nSubmitted ${age}`,
			);
		}
		return message.reply({ embeds: [e] });
	} catch (e) {
		try {
			require('../utils/logger').error('[myapps] error', { err: e.message });
		} catch {}
		return message.reply({ content: 'Failed to load your applications.' });
	}
}

function formatRelative(ts) {
	if (!ts) return 'unknown';
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	return `${days}d ago`;
}

module.exports = { handleMyAppsCommand };
