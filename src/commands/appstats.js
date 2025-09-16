// Application analytics command (.appstats)
const { summarizeApplications } = require('../utils/applications');
const { createEmbed, safeAddField } = require('../utils/embeds');

async function handleAppStatsCommand(client, message) {
	try {
		const { overall, applications } = summarizeApplications();
		const e = createEmbed({
			title: 'Application Stats',
			description: 'Submission counts & acceptance rates.',
		});
		safeAddField(
			e,
			'Overall',
			`Total: **${overall.total}**\nPending: ${overall.pending}\nAccepted: ${overall.accepted}\nDenied: ${overall.denied}\nAcceptance Rate: ${overall.acceptanceRate}%`,
		);
		if (!applications.length) {
			safeAddField(e, 'Apps', 'No applications yet.');
		} else {
			for (const app of applications.slice(0, 10)) {
				safeAddField(
					e,
					`${app.name} (#${app.appId})`,
					`Total: ${app.total} | P:${app.pending} A:${app.accepted} D:${app.denied} | AR:${app.acceptanceRate}%`,
				);
			}
		}
		return message.reply({ embeds: [e] });
	} catch (e) {
		try {
			require('../utils/logger').error('[appstats] error', { err: e.message });
		} catch {}
		return message.reply({ content: 'Failed to compute application stats.' });
	}
}

module.exports = { handleAppStatsCommand };
