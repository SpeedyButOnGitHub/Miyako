// Stores volatile runtime augmentation for events separate from persisted core event definitions.
// Fields: anchorChannelId, anchorMessageId, __notifMsgs, __clockIn, dynamicBaseContent (optional runtime override)
// Persisted to data/private/eventsRuntime.json (gitignored)
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');
const PRIV_DIR = path.join(dataDir(), 'private');
const FILE = path.join(PRIV_DIR, 'eventsRuntime.json');

function ensure() { try { if (!fs.existsSync(PRIV_DIR)) fs.mkdirSync(PRIV_DIR,{recursive:true}); if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ events:{} }, null, 2)); } catch {} }
function load() { ensure(); try { return JSON.parse(fs.readFileSync(FILE,'utf8')); } catch { return { events:{} }; } }
function save(obj) { ensure(); try { fs.writeFileSync(FILE, JSON.stringify(obj,null,2)); } catch {} }

function getRuntime(id) { const db = load(); return db.events[id] || {}; }
function setRuntime(id, patch) { const db = load(); const cur = db.events[id] || {}; db.events[id] = { ...cur, ...patch }; save(db); return db.events[id]; }

module.exports = { getRuntime, setRuntime };