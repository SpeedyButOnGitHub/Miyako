const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(process.cwd());
const SUMMARY_FILE = path.join(projectRoot, 'config', 'startup-summary.json');

function _ensure() {
  try {
    const dir = path.dirname(SUMMARY_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

function load() {
  try {
    _ensure();
    if (!fs.existsSync(SUMMARY_FILE)) return { ts: Date.now(), actions: [] };
    return JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) || { ts: Date.now(), actions: [] };
  } catch (e) { return { ts: Date.now(), actions: [] }; }
}

function add(action) {
  try {
    _ensure();
    const cur = load();
    cur.ts = cur.ts || Date.now();
    cur.actions = Array.isArray(cur.actions) ? cur.actions : [];
    cur.actions.push({ ts: Date.now(), ...action });
    // Keep last 200 actions to avoid unbounded growth
    if (cur.actions.length > 200) cur.actions = cur.actions.slice(-200);
    fs.writeFileSync(SUMMARY_FILE, JSON.stringify(cur, null, 2));
  } catch (e) { try { console.error('[startupSummary] write failed', e && e.message); } catch {} }
}

module.exports = { load, add };
