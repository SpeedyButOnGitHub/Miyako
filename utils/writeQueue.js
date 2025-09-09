// Simple async write queue to serialize and debounce file writes.
// Provides enqueueWrite(filePath, getContentFn) which batches rapid updates.
const fs = require('fs');
const path = require('path');

const pending = new Map(); // filePath -> { timer, lastContent }

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
    entry = { timer: null, lastContent: content };
    pending.set(filePath, entry);
  } else {
    entry.lastContent = content;
    if (entry.timer) clearTimeout(entry.timer);
  }
  entry.timer = setTimeout(() => flush(filePath), delay);
  if (typeof entry.timer.unref === 'function') entry.timer.unref();
}

module.exports = { enqueueWrite, flushAll };
