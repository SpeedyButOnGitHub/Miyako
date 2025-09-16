const { createEmbed, safeAddField } = require('../utils/embeds');
const theme = require('../utils/theme');
const { getEvents } = require('../utils/eventsStorage');
const { getOwnerId } = require('./moderation/permissions');

function buildClockInStateEmbed() {
	const events = getEvents();
	const clockEvents = events.filter((e) => e.__clockIn && e.__clockIn.positions);
	const embed = createEmbed({
		title: '🕒 Clock-In State',
		description: clockEvents.length
			? `${clockEvents.length} event(s) with active clock-in state.`
			: 'No clock-in state found.',
		color: theme.colors.primary,
	});
	for (const ev of clockEvents.slice(0, 10)) {
		// cap to avoid overlong embed
		const pos = ev.__clockIn.positions || {};
		const autoNext = ev.__clockIn.autoNext || {};
		const roles = ['instance_manager', 'manager', 'bouncer', 'bartender', 'backup', 'maybe'];
		const lines = [];
		for (const r of roles) {
			const arr = Array.isArray(pos[r]) ? pos[r] : [];
			if (!arr.length) continue;
			const label = r.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
			const starred = arr.map((id) => {
				const assigned =
					typeof autoNext[id] === 'string' ? autoNext[id] : autoNext[id] && autoNext[id].role;
				return `<@${id}>${assigned === r ? '*' : ''}`;
			});
			lines.push(`${label}: ${starred.join(', ')}`.slice(0, 350));
		}
		if (!lines.length) lines.push('(empty)');
		const lastSent = ev.__clockIn.lastSentTs
			? `<t:${Math.floor(ev.__clockIn.lastSentTs / 1000)}:R>`
			: '—';
		const totalUsers = Object.values(pos).reduce(
			(acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
			0,
		);
		const autoNextCount = Object.keys(autoNext).length;
		lines.push(`Last Msg: ${lastSent}`);
		lines.push(`Users: ${totalUsers} | AutoNext: ${autoNextCount}`);
		if (autoNextCount) {
			const preview = Object.entries(autoNext)
				.slice(0, 5)
				.map(([uid, val]) => {
					const role = typeof val === 'string' ? val : val && val.role;
					return `<@${uid}>→${role}`;
				})
				.join(' ');
			lines.push(`AutoNext Sample: ${preview}`.slice(0, 200));
		}
		safeAddField(embed, ev.name || `Event ${ev.id}`, lines.join('\n').slice(0, 1024));
	}
	if (clockEvents.length > 10) {
		safeAddField(embed, 'Note', `+${clockEvents.length - 10} more event(s) truncated.`);
	}
	return embed;
}

async function handleClockInStateCommand(client, message) {
	const ownerId = getOwnerId();
	if (message.author.id !== ownerId) return; // restrict
	try {
		const embed = buildClockInStateEmbed();
		await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
	} catch (e) {
		await message
			.reply({
				content: 'Failed to build clock-in state: ' + (e.message || e),
				allowedMentions: { repliedUser: false },
			})
			.catch(() => {});
	}
}

module.exports = { handleClockInStateCommand };
