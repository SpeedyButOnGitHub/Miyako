const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const PRIV_DIR = path.join(dataDir(), 'private');
const FILE = path.join(PRIV_DIR, 'scheduledDeletes.json');

function ensure() { try { if (!fs.existsSync(PRIV_DIR)) fs.mkdirSync(PRIV_DIR,{recursive:true}); if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ messages:{} }, null, 2)); } catch {} }
function load() { ensure(); try { return JSON.parse(fs.readFileSync(FILE,'utf8')); } catch { return { messages:{} }; } }
function save(obj) { ensure(); try { fs.writeFileSync(FILE, JSON.stringify(obj,null,2)); } catch {} }

function getAll() { const db = load(); return db.messages || {}; }
function setForMessage(messageId, entry) { const db = load(); db.messages = db.messages || {}; db.messages[messageId] = entry; save(db); return db.messages[messageId]; }
function removeForMessage(messageId) { const db = load(); db.messages = db.messages || {}; if (messageId in db.messages) delete db.messages[messageId]; save(db); }

module.exports = { getAll, setForMessage, removeForMessage };
