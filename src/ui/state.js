// Toggle state and visual helpers migrated from utils/ui.js
const theme = require('./theme');
const { createEmbed } = require('./embeds');

const toggleRegistry = [];
function registerToggle(def) {
	if (!def || !def.key || typeof def.getter !== 'function') return;
	if (toggleRegistry.find((t) => t.key === def.key)) return;
	toggleRegistry.push(def);
}
function getToggleState(key) {
	const t = toggleRegistry.find((x) => x.key === key);
	if (!t) return null;
	try {
		const v = t.getter();
		if (t.kind === 'boolean') return { value: !!v, on: !!v };
		if (t.kind === 'mode') return { value: v, on: typeof t.on === 'function' ? !!t.on(v) : !!v };
		return { value: v };
	} catch {
		return null;
	}
}
function getToggleVisual(on) {
	return {
		emoji: on ? theme.emojis.enable || '✅' : theme.emojis.disable || '❌',
		color: on ? theme.colors.success : theme.colors.neutral,
		prefix: on ? '✅' : '❌',
	};
}
function applyToggleVisual(embed, { on } = { on: false }) {
	try {
		if (!embed || typeof embed.setColor !== 'function') return embed;
		const visual = getToggleVisual(on);
		embed.setColor(visual.color);
		if (embed.data && embed.data.title) {
			const t = embed.data.title.replace(/^([🔴🟢✅❌]\s*)*/u, '');
			embed.setTitle(`${visual.prefix} ${t}`);
		}
	} catch {}
	return embed;
}
function buildSettingEmbedUnified({ title, description, current, toggleKey, lastUpdatedTs } = {}) {
	const e = createEmbed({ title, description, color: theme.colors.neutral, timestamp: true });
	if (current) e.addFields({ name: 'Current', value: current });
	if (toggleKey) {
		const st = getToggleState(toggleKey);
		if (st && typeof st.on === 'boolean') applyToggleVisual(e, { on: st.on });
	}
	if (lastUpdatedTs) {
		const rel = Math.floor(lastUpdatedTs / 1000);
		e.setFooter({ text: `Last Updated: <t:${rel}:R>` });
	}
	return e;
}
module.exports = {
	registerToggle,
	getToggleState,
	getToggleVisual,
	applyToggleVisual,
	buildSettingEmbedUnified,
};
