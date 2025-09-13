// Simple in-memory TTL-based send guard to avoid duplicate sends in race conditions
// Keyed by a caller-provided key, e.g., `${scope}:${channelId}:${eventId}:${notifId}`
// Expires entries after ttlMs. Safe in single-process use; if you shard/process separately,
// consider replacing with a shared store.

const _seen = new Map(); // key -> timestamp

function seenRecently(key, ttlMs = 30000) {
	const now = Date.now();
	// prune sometimes
	if (_seen.size > 2000) {
		for (const [k, ts] of _seen) {
			if (now - ts > ttlMs) _seen.delete(k);
		}
	}
	const last = _seen.get(key) || 0;
	if (now - last < ttlMs) return true;
	_seen.set(key, now);
	return false;
}

module.exports = { seenRecently };
