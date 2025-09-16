const { config } = require('./storage');
const { getLevel } = require('./levels');
const logger = require('./logger');

// Reconcile configured level reward roles on startup.
// Safety: rate-limited, capped, and guarded by config flags.
async function reconcileRoles(client) {
	try {
		if (!client || !client.isReady || !client.isReady()) return;
		if (!config || !config.levelRewards || typeof config.levelRewards !== 'object') return;
		if (config.disableStartupRoleReconcile) {
			logger && logger.info && logger.info('[ReconcileRoles] disabled via config');
			return;
		}

		const guild = client.guilds.cache.first();
		if (!guild) return;

		// Build flattened list of { level: Number, roleId }
		const pairs = [];
		for (const [lvlStr, roles] of Object.entries(config.levelRewards || {})) {
			const lvl = parseInt(lvlStr, 10);
			if (!Number.isFinite(lvl)) continue;
			const arr = Array.isArray(roles) ? roles : roles ? [roles] : [];
			for (const r of arr) pairs.push({ level: lvl, roleId: r });
		}
		if (!pairs.length) return;

		// Sort by level ascending so lower-level roles are applied first
		pairs.sort((a, b) => a.level - b.level);

		// Throttling parameters
		const perAddDelayMs = Number.isFinite(config.startupReconcileDelayMs)
			? config.startupReconcileDelayMs
			: 250;
		const maxAdds = Number.isFinite(config.startupReconcileMaxAdds)
			? config.startupReconcileMaxAdds
			: 300;

		let adds = 0;

		// Iterate guild members (fetch partials if necessary)
		// Use forEach over cached members, but also try to fetch all if small guild
		const members = guild.members.cache;
		for (const member of members.values()) {
			try {
				const uid = member.id;
				const lvl = getLevel(uid) || 0;
				if (!lvl) continue;
				for (const p of pairs) {
					if (lvl >= p.level) {
						if (member.roles.cache.has(p.roleId)) continue;
						if (adds >= maxAdds)
							return (
								logger &&
								logger.info &&
								logger.info('[ReconcileRoles] reached max adds', { maxAdds })
							);
						try {
							await member.roles.add(p.roleId);
							adds++;
							logger &&
								logger.info &&
								logger.info('[ReconcileRoles] added role', {
									userId: uid,
									roleId: p.roleId,
									level: p.level,
								});
						} catch (err) {
							logger &&
								logger.warn &&
								logger.warn('[ReconcileRoles] failed to add role', {
									userId: uid,
									roleId: p.roleId,
									err: err && err.message,
								});
						}
						// Throttle a bit between role adds to be gentle
						await new Promise((r) => setTimeout(r, perAddDelayMs));
					}
				}
			} catch (err) {
				// ignore per-member errors but log a little
				logger &&
					logger.debug &&
					logger.debug('[ReconcileRoles] member loop error', { err: err && err.message });
			}
		}
		logger && logger.info && logger.info('[ReconcileRoles] finished', { adds });
	} catch (e) {
		logger && logger.error && logger.error('[ReconcileRoles] failed', { err: e && e.message });
	}
}

module.exports = { reconcileRoles };
