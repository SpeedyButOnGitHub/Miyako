const { config } = require('./storage');
const {
	applyPlaceholdersToJsonPayload,
	sanitizeMentionsForTesting,
} = require('../commands/schedule/helpers');
const { applyTimestampPlaceholders } = require('./timestampPlaceholders');
const logger = require('./logger');

/**
 * Render payload for a non-clockin auto message.
 * Returns { payload, mentionLine }
 */
function renderPayloadForNotif(client, ev, notif) {
	try {
		if (!notif) return { payload: null, mentionLine: null };
		// If this is a clock-in notification, always render via canonical embed builder
		if (notif.isClockIn) {
			try {
				const { buildClockInEmbed } = require('../utils/clockinTemplate');
				ev.__clockIn = ev.__clockIn || { positions: {}, messageIds: [] };
				// Ensure positions keys exist so builder sees consistent shape
				const POS_KEYS = Object.keys(require('../commands/schedule/actions').POSITIONS || {}) || [
					'instance_manager',
					'manager',
					'bouncer',
					'bartender',
					'backup',
					'maybe',
				];
				for (const k of POS_KEYS)
					if (!Array.isArray(ev.__clockIn.positions[k])) ev.__clockIn.positions[k] = [];
				const embed = buildClockInEmbed(ev);
				// Compose payload; allow notif.mentions to map to allowedMentions
				const payload = { content: '', embeds: [embed] };
				if (Array.isArray(notif.mentions) && notif.mentions.length)
					payload.allowedMentions = { roles: notif.mentions.slice(0, 20) };
				return {
					payload,
					mentionLine:
						Array.isArray(notif.mentions) && notif.mentions.length
							? notif.mentions.map((r) => `<@&${r}>`).join(' ')
							: null,
				};
			} catch (e) {
				logger &&
					logger.warn &&
					logger.warn('[autoRenderer] failed building clockin embed', { err: e && e.message });
				return { payload: null, mentionLine: null };
			}
		}

		// Legacy renderer fallback: log if attempted for clock-in
		if (notif.isClockIn) {
			logger &&
				logger.warn &&
				logger.warn('[autoMessageRenderer] Legacy renderer attempted for Staff Clock In', {
					eventId: ev && ev.id,
				});
			return { payload: null, mentionLine: null };
		}
		// For non-clockin, retain legacy rendering
		let payload = null;
		if (notif.messageJSON && typeof notif.messageJSON === 'object') {
			const base = { ...notif.messageJSON };
			if (base.embeds && !Array.isArray(base.embeds)) base.embeds = [base.embeds];
			if (!base.content && !base.embeds)
				base.content = notif.message || `Auto message (${ev && ev.name ? ev.name : 'Event'})`;
			try {
				payload = applyPlaceholdersToJsonPayload(base, ev);
			} catch (e) {
				payload = base;
			}
		} else {
			let content = notif.message || '';
			content = applyTimestampPlaceholders(content, ev);
			if (config.testingMode) content = sanitizeMentionsForTesting(content);
			if (!content) content = `Auto message (${ev && ev.name ? ev.name : 'Event'})`;
			payload = { content };
		}

		let mentionLine = null;
		try {
			if (Array.isArray(notif.mentions) && notif.mentions.length) {
				mentionLine = notif.mentions.map((r) => `<@&${r}>`).join(' ');
				if (payload.content) payload.content = `${mentionLine}\n${payload.content}`.slice(0, 2000);
				else payload.content = mentionLine.slice(0, 2000);
				payload.allowedMentions = { roles: notif.mentions.slice(0, 20) };
			}
		} catch (e) {
			logger &&
				logger.warn &&
				logger.warn('[autoRenderer] mention attach failed', { err: e && e.message });
		}

		return { payload, mentionLine };
	} catch (e) {
		logger && logger.warn && logger.warn('[autoRenderer] render failed', { err: e && e.message });
		return { payload: null, mentionLine: null };
	}
}

module.exports = { renderPayloadForNotif };
