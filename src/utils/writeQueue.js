const fs = require('fs');
const path = require('path');

// Simple per-path write queue to serialize writes and make them atomic
// Usage: enqueueWrite(filePath, () => JSON.stringify(data), { delay: 200, backups: true })

const queues = new Map(); // filePath -> { writing: false, pending: [], timer: null }

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function backupFile(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return;
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    const backupDir = path.join(dir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `${base}.${ts}.bak`);
    fs.copyFileSync(targetPath, backupPath);
    // Optional: prune to last N backups
    const MAX = 10;
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith(base + '.'))
      .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (let i = MAX; i < files.length; i++) {
      try { fs.unlinkSync(path.join(backupDir, files[i].f)); } catch {}
    }
  } catch {}
}

function doAtomicWrite(targetPath, content, opts = {}) {
  ensureDir(targetPath);
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  if (opts.backups) backupFile(targetPath);
  fs.writeFileSync(tmpPath, content, 'utf8');
  // On Windows, rename over existing file is atomic for same volume
  fs.renameSync(tmpPath, targetPath);
}

function processQueue(state, filePath) {
  if (state.writing) return;
  const job = state.pending.shift();
  if (!job) return;
  state.writing = true;
  try {
    const content = job.serialize();
    doAtomicWrite(filePath, content, job.opts);
  } catch (e) {
    // Best-effort: log to console; caller can add more structured logging
    try { require('./logger').error('[writeQueue] write failed', { file: filePath, err: e.message }); } catch {}
  } finally {
    state.writing = false;
    // Schedule next to yield back to event loop
    setImmediate(() => processQueue(state, filePath));
  }
}

function enqueueWrite(filePath, serialize, opts = {}) {
  const { delay = 0, backups = true } = opts;
  let state = queues.get(filePath);
  if (!state) {
    state = { writing: false, pending: [], timer: null };
    queues.set(filePath, state);
  }

  const schedule = () => {
    state.timer = null;
    state.pending.push({ serialize, opts: { backups } });
    processQueue(state, filePath);
  };

  if (delay > 0) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(schedule, delay);
  } else {
    schedule();
  }
}

module.exports = { enqueueWrite };

