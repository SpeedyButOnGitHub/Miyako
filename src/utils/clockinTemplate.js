// Canonical Staff Clock-In embed template & renderer.
const { config } = require('./storage');

const BASE_TEMPLATE = Object.freeze({
	title: '🕒 Staff Clock In — {{EVENT_NAME}}',
	description:
		'Please select your role below to clock in.\n\n**Instance Manager** is responsible for opening, managing and closing an instance.',
	color: 3447003,
	fields: [
		{ name: '📝 Instance Manager (1 slot)', value: '{{IM_VALUE}}', inline: true },
		{ name: '🛠️ Manager', value: '{{MANAGER}}', inline: true },
		{ name: '🛡️ Bouncer', value: '{{BOUNCER}}', inline: true },
		{ name: '🍸 Bartender', value: '{{BARTENDER}}', inline: true },
		{ name: '🎯 Backup', value: '{{BACKUP}}', inline: true },
		{ name: '⏳ Maybe / Late', value: '{{MAYBE}}', inline: true },
		{
			name: 'Eligible roles',
			value:
				'<@&1375995842858582096>, <@&1380277718091829368>, <@&1380323145621180466>, <@&1375958480380493844>',
		},
	],
	footer: { text: 'Late Night Hours | Staff clock in for {{EVENT_NAME}}' },
});

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}
function getAutoNextRole(val) {
	return typeof val === 'string' ? val : val && typeof val === 'object' ? val.role : null;
}
function fmtMentions(arr = [], roleKey = null, autoNextMap = null) {
	if (!Array.isArray(arr) || arr.length === 0) return '*None*';
	const lines = arr.map((id) => {
		const starred =
			autoNextMap && roleKey && getAutoNextRole(autoNextMap[id]) === roleKey ? '*' : '';
		return `<@${id}>${starred}`;
	});
	const s = lines.join('\n');
	// In testing mode, quote mentions so snapshots are stable; preserve newlines
	if (config.testingMode) {
		return s
			.split('\n')
			.map((line) => line.replace(/<@&?\d+>\*?/g, (m) => `\`${m}\``))
			.join('\n');
	}
	return s;
}

function buildClockInEmbed(ev) {
	const tpl = clone(BASE_TEMPLATE);
	const name = ev.name || 'Event';
	const positions = (ev.__clockIn && ev.__clockIn.positions) || {};
	const autoNext = (ev.__clockIn && ev.__clockIn.autoNext) || null;
	const im = positions.instance_manager || [];
	tpl.title = tpl.title.replace(/{{EVENT_NAME}}/g, name);
	tpl.footer.text = tpl.footer.text.replace(/{{EVENT_NAME}}/g, name);
	tpl.fields = tpl.fields.map((f) => {
		const out = { ...f };
		if (out.value && typeof out.value === 'string') {
			out.value = out.value
				.replace(
					'{{IM_VALUE}}',
					`${im.length} / 1\n${fmtMentions(im, 'instance_manager', autoNext)}`,
				)
				.replace('{{MANAGER}}', fmtMentions(positions.manager, 'manager', autoNext))
				.replace('{{BOUNCER}}', fmtMentions(positions.bouncer, 'bouncer', autoNext))
				.replace('{{BARTENDER}}', fmtMentions(positions.bartender, 'bartender', autoNext))
				.replace('{{BACKUP}}', fmtMentions(positions.backup, 'backup', autoNext))
				.replace('{{MAYBE}}', fmtMentions(positions.maybe, 'maybe', autoNext));
		}
		return out;
	});
	// Legend removed per request: do not include a Legend field in the clock-in embed
	return tpl;
}

module.exports = { buildClockInEmbed, BASE_TEMPLATE };
