const { updateEvent, getEvent } = require('../utils/eventsStorage');

/**
 * Prune clock-in positions for a specific event id: keep only users from autoNext
 * mapped to their chosen roles. Optionally clear consumed autoNext entries.
 * Returns true if an update was performed.
 */
function pruneClockInForEvent(evId, options = { clearConsumedAutoNext: true }) {
	try {
		const ev = getEvent(evId);
		if (!ev || !ev.__clockIn) return false;
		const clock =
			ev.__clockIn && typeof ev.__clockIn === 'object'
				? { ...ev.__clockIn }
				: { positions: {}, autoNext: {} };
		const autoNext =
			clock.autoNext && typeof clock.autoNext === 'object' ? { ...clock.autoNext } : {};
		const prunedPositions = {};
		for (const [uid, v] of Object.entries(autoNext)) {
			const roleKey = typeof v === 'string' ? v : v && typeof v === 'object' ? v.role : null;
			if (!roleKey) continue;
			if (!Array.isArray(prunedPositions[roleKey])) prunedPositions[roleKey] = [];
			if (!prunedPositions[roleKey].includes(uid)) prunedPositions[roleKey].push(uid);
			if (options.clearConsumedAutoNext) delete autoNext[uid];
		}
		clock.positions = prunedPositions;
		if (options.clearConsumedAutoNext) clock.autoNext = autoNext;
		updateEvent(evId, { __clockIn: clock });
		return true;
	} catch (e) {
		return false;
	}
}

module.exports = { pruneClockInForEvent };
