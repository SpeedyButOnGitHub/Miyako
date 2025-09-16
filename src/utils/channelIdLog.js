// Centralized channel ID log storage separate from events.json to keep sensitive channel references out of versioned runtime event data.
// Writes to data/private/channelIds.json (gitignored).
const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');

const PRIV_DIR = path.join(dataDir(), 'private');
const FILE = path.join(PRIV_DIR, 'channelIds.json');

function ensure() {
	try {
		if (!fs.existsSync(PRIV_DIR)) fs.mkdirSync(PRIV_DIR, { recursive: true });
	} catch {}
	try {
		if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ events: {} }, null, 2));
	} catch {}
}

function load() {
	ensure();
	try {
		return JSON.parse(fs.readFileSync(FILE, 'utf8'));
	} catch {
		return { events: {} };
	}
}

function save(obj) {
	ensure();
	try {
		fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
	} catch {}
}

function recordEventChannel(eventId, channelId) {
	if (!eventId || !channelId) return;
	const obj = load();
	if (!obj.events) obj.events = {};
	obj.events[eventId] = { channelId, ts: Date.now() };
	save(obj);
}

function getEventChannel(eventId) {
	const obj = load();
	return obj.events?.[eventId] || null;
}

module.exports = { recordEventChannel, getEventChannel };
