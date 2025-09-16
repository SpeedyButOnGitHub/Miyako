// Simple permission result cache to reduce repeated role/permission scanning.
// Not persisted; safe to lose on restart.
const cache = new Map(); // key guildId:userId -> { ok, expires }
const TTL = 60 * 1000; // 60s

function getCached(guildId, userId) {
	const key = guildId + ':' + userId;
	const v = cache.get(key);
	if (!v) return null;
	if (v.expires < Date.now()) {
		cache.delete(key);
		return null;
	}
	return v.ok;
}

function setCached(guildId, userId, ok) {
	cache.set(guildId + ':' + userId, { ok, expires: Date.now() + TTL });
}

function sweep() {
	const now = Date.now();
	for (const [k, v] of cache.entries()) if (v.expires < now) cache.delete(k);
}
setInterval(sweep, TTL).unref?.();

module.exports = { getCached, setCached };
