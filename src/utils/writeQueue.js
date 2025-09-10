// Simple async write queue to serialize and debounce file writes.
// Provides enqueueWrite(filePath, getContentFn) which batches rapid updates.
const fs = require('fs');
const path = require('path');

const pending = new Map(); // filePath -> { timer, lastContent, created }
let metrics = { enqueued: 0, flushed: 0, lastFlushAt: 0 };
const MAX_FLUSH_INTERVAL_MS = 5000; // force flush at most 5s after first enqueue
let watchdog = null;

function ensureDir(filePath) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		try { fs.mkdirSync(dir, { recursive: true }); } catch {}
	}
}

function flush(filePath) {
	const entry = pending.get(filePath);
	if (!entry) return;
	pending.delete(filePath);
	try {
		ensureDir(filePath);
		fs.writeFileSync(filePath, entry.lastContent);
	} catch {}
	metrics.flushed++; metrics.lastFlushAt = Date.now();
}

function flushAll() {
	for (const filePath of Array.from(pending.keys())) {
		try { flush(filePath); } catch {}
	}
}

function enqueueWrite(filePath, getContentFn, { delay = 150 } = {}) {
	let entry = pending.get(filePath);
	const content = getContentFn();
	if (!entry) {
		entry = { timer: null, lastContent: content, created: Date.now() };
		pending.set(filePath, entry);
	} else {
		entry.lastContent = content;
		if (entry.timer) clearTimeout(entry.timer);
	}
	entry.timer = setTimeout(() => flush(filePath), delay);
	if (typeof entry.timer.unref === 'function') entry.timer.unref();
	metrics.enqueued++;
	// Start watchdog to force flush stale entries
	if (!watchdog) {
		watchdog = setInterval(() => {
			const now = Date.now();
			for (const [fp, ent] of pending.entries()) {
				if (now - ent.created > MAX_FLUSH_INTERVAL_MS) {
					try { flush(fp); } catch {}
				}
			}
		}, 2000);
		if (watchdog.unref) watchdog.unref();
	}
}
function getWriteQueueMetrics() { return { ...metrics, pending: pending.size }; }

module.exports = { enqueueWrite, flushAll, getWriteQueueMetrics };
