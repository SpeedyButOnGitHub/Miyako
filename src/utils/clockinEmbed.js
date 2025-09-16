// Unified "Staff Clock-In" embed renderer to keep styling consistent and compact
// across scheduler auto-messages, manual triggers, and interaction updates.
// Preserves existing logic and IDs; only presentation is improved.

const { createEmbed, safeAddField } = require('./embeds');
const theme = require('./theme');
const { computeNextRange } = require('./timestampPlaceholders');

// Standard role meta used for consistent labeling/emojis
const ROLE_META = {
	instance_manager: { label: 'Instance Manager', emoji: '📝' },
	manager: { label: 'Manager', emoji: '🛠️' },
	bouncer: { label: 'Bouncer', emoji: '🛡️' },
	bartender: { label: 'Bartender', emoji: '🍸' },
	backup: { label: 'Backup', emoji: '🎯' },
	maybe: { label: 'Maybe/Late', emoji: '⏳' },
};

// Build a tiny capacity bar using simple squares for broad device support
// length=5 cells, using ■ (filled) and □ (empty)
function capacityBar(count, cap, cells = 5) {
	if (!cap || cap <= 0) return null;
	const pct = Math.max(0, Math.min(1, count / cap));
	const filled = Math.max(0, Math.min(cells, Math.round(pct * cells)));
	return '■'.repeat(filled) + '□'.repeat(cells - filled);
}

// Build the embed. arguments:
// - ev: event object (name, times/ranges for footer)
// - positions: { [roleKey]: string[] userIds }
// - capacities: { [roleKey]: number|undefined } optional caps per role
// - options: { compact?: boolean }
function buildClockInEmbed(ev, positions = {}, capacities = {}, options = {}) {
	const name = ev?.name || 'Event';
	const color = theme.colors?.primary || 0x5865f2;
	const title = `🕒 Staff Clock-In — ${name}`;
	const description =
		'Select your role from the menu. One slot per staff. Updates apply instantly.';

	const embed = createEmbed({ title, description, color, timestamp: true });

	const order = ['instance_manager', 'manager', 'bouncer', 'bartender', 'backup', 'maybe'];
	for (const key of order) {
		const meta = ROLE_META[key] || { label: key, emoji: '' };
		const arr = Array.isArray(positions[key]) ? positions[key] : [];
		const cap = Number.isFinite(capacities[key]) ? Number(capacities[key]) : null;
		const count = arr.length;
		const countText = cap ? `${count}/${cap}` : `${count}`;
		const fieldName = `${meta.emoji ? meta.emoji + ' ' : ''}${meta.label} (${countText})`;
		const mentions = count
			? arr
					.map((id) => `<@${id}>`)
					.join(', ')
					.slice(0, 1024)
			: '—';
		const bar = cap ? capacityBar(count, cap) : null;
		const fieldValue = bar ? `${bar}\n${mentions}` : mentions;
		safeAddField(embed, fieldName, fieldValue, true);
	}

	// Footer with dynamic timing info (starts/ends) if known
	try {
		const r = computeNextRange(ev);
		const now = Date.now() / 1000;
		if (r && r.startSec && r.endSec) {
			let footer = `Event: ${name}`;
			if (now < r.startSec) footer = `${footer} • Starts <t:${r.startSec}:R>`;
			else if (now >= r.startSec && now < r.endSec) footer = `${footer} • Ends <t:${r.endSec}:t>`;
			embed.setFooter({ text: footer });
		} else {
			embed.setFooter({ text: `Event: ${name}` });
		}
	} catch {
		embed.setFooter({ text: `Event: ${name}` });
	}

	return embed;
}

module.exports = { buildClockInEmbed, ROLE_META };
