const { createEmbed } = require('../utils/embeds');
const { getToggleState } = require('../ui');
const ActiveMenus = require('../utils/activeMenus');
const theme = require('../utils/theme');

async function handleDiagnosticsCommand(client, message) {
	const sessions = ActiveMenus.snapshotSessions ? ActiveMenus.snapshotSessions() : [];
	let emptyRows = 0;
	for (const s of sessions) {
		for (const row of s.components || []) {
			if (row && Array.isArray(row.components) && row.components.length === 0) emptyRows++;
		}
	}
	const toggles = ['testingMode', 'snipeMode', 'levelingMode'];
	const toggleStates = toggles.map((k) => ({ k, st: getToggleState(k) }));
	const lines = [];
	lines.push(`Active Sessions: ${sessions.length}`);
	lines.push(`Empty Component Rows: ${emptyRows}`);
	for (const t of toggleStates) {
		if (!t.st) continue;
		lines.push(`Toggle ${t.k}: ${t.st.on ? 'ON' : 'OFF'} (value=${t.st.value})`);
	}
	const embed = createEmbed({
		title: `${theme.emojis.health || '🩺'} Diagnostics`,
		description: lines.join('\n'),
		color: emptyRows ? theme.colors.danger : theme.colors.success,
	});
	return await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

module.exports = { handleDiagnosticsCommand };
