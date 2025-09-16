const { addVCXP, saveVCLevels } = require('./vcLevels');
const { addCash } = require('./cash');

// Track join times and periodic ticks
const voiceStates = new Map(); // userId -> { joinedAt: number, channelId: string }
let interval = null;

// Configurable constants
const TICK_MS = 60 * 1000; // award per minute
const XP_PER_MIN = 10; // base XP per minute

function startVoiceLeveling(client) {
	if (interval) clearInterval(interval);

	client.on('voiceStateUpdate', (oldState, newState) => {
		const userId = newState.id || oldState.id;
		const wasInVC = !!oldState?.channelId;
		const nowInVC = !!newState?.channelId;
		if (!wasInVC && nowInVC) {
			voiceStates.set(userId, { joinedAt: Date.now(), channelId: newState.channelId });
		} else if (wasInVC && !nowInVC) {
			flushUser(userId);
			voiceStates.delete(userId);
		} else if (wasInVC && nowInVC && oldState.channelId !== newState.channelId) {
			// moved channels: flush then reset
			flushUser(userId);
			voiceStates.set(userId, { joinedAt: Date.now(), channelId: newState.channelId });
		}
	});

	interval = setInterval(() => {
		const now = Date.now();
		for (const [userId, st] of voiceStates.entries()) {
			if (!st || !st.joinedAt) continue;
			const mins = Math.floor((now - st.joinedAt) / TICK_MS);
			if (mins <= 0) continue;
			const gained = mins * XP_PER_MIN;
			const newLevel = addVCXP(userId, gained);
			if (newLevel > 0) {
				// Award Cash on VC level up (separate rule allows easy tuning later)
				const cashReward = Math.max(0, Math.floor(40 + newLevel * 8));
				addCash(userId, cashReward);
			}
			st.joinedAt = st.joinedAt + mins * TICK_MS; // advance checkpoint
		}
		// persist occasionally
		saveVCLevels();
	}, TICK_MS);
	if (typeof interval.unref === 'function') interval.unref();
}

function flushUser(userId) {
	const st = voiceStates.get(userId);
	if (!st) return;
	const now = Date.now();
	const mins = Math.floor((now - st.joinedAt) / TICK_MS);
	if (mins > 0) addVCXP(userId, mins * XP_PER_MIN);
	saveVCLevels();
}

module.exports = { startVoiceLeveling };
