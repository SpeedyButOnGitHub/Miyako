const fs = require('fs');
const path = require('path');

// Simple per-path write queue to serialize writes and make them atomic
// Usage: enqueueWrite(filePath, () => JSON.stringify(data), { delay: 200, backups: true })

const queues = new Map(); // filePath -> { writing: false, pending: [], timer: null }

function ensureDir(p) {
  const d = path.dirname(p);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function backupFile(targetPath, aggregate = false) {
  try {
    if (!fs.existsSync(targetPath)) return;
    const dir = path.dirname(targetPath);
    const base = path.basename(targetPath);
    const backupDir = path.join(dir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    if (aggregate) {
      // Maintain a single JSON array file containing recent versions
      const aggFile = path.join(backupDir, `${base}.aggregate.json`);
      let arr = [];
      if (fs.existsSync(aggFile)) {
        try { arr = JSON.parse(fs.readFileSync(aggFile,'utf8')); if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
      }
      const content = fs.readFileSync(targetPath,'utf8');
      arr.push({ ts: Date.now(), content });
      // Keep last 25 versions
      if (arr.length > 25) arr = arr.slice(-25);
      try { fs.writeFileSync(aggFile, JSON.stringify(arr, null, 2)); } catch {}
    } else {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${base}.${ts}.bak`);
      fs.copyFileSync(targetPath, backupPath);
      // Prune old individual backups
      const MAX = 10;
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(base + '.') && !f.endsWith('.aggregate.json'))
        .map(f => ({ f, t: fs.statSync(path.join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (let i = MAX; i < files.length; i++) {
        try { fs.unlinkSync(path.join(backupDir, files[i].f)); } catch {}
      }
    }
  } catch {}
}

function doAtomicWrite(targetPath, content, opts = {}) {
  ensureDir(targetPath);
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  if (opts.backups) backupFile(targetPath, opts.aggregateBackups);
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
  const { delay = 0, backups = true, aggregateBackups = false } = opts;
  let state = queues.get(filePath);
  if (!state) {
    state = { writing: false, pending: [], timer: null };
    queues.set(filePath, state);
  }

  const schedule = () => {
    state.timer = null;
    state.pending.push({ serialize, opts: { backups, aggregateBackups } });
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

