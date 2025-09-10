const fs = require("fs");
const path = require("path");
const { cfgPath } = require('./paths');

const EVENTS_FILE = cfgPath('events.json');

function ensureFile() {
	const dir = path.dirname(EVENTS_FILE);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(EVENTS_FILE)) {
		const initial = { nextId: 1, events: [] };
		fs.writeFileSync(EVENTS_FILE, JSON.stringify(initial, null, 2));
	}
}

function loadObj() {
	ensureFile();
	try {
		let raw = fs.readFileSync(EVENTS_FILE, "utf8");
		// Attempt to heal common JSON mistakes (trailing commas) before parse
		try {
			// Remove trailing commas before } or ]
			raw = raw.replace(/,\s*([}\]])/g, '$1');
		} catch {}
		const data = JSON.parse(raw);
		if (!Array.isArray(data.events)) data.events = [];
		if (typeof data.nextId !== "number") data.nextId = 1;
		return data;
	} catch {
		return { nextId: 1, events: [] };
	}
}

function saveObj(obj) {
	ensureFile();
	fs.writeFileSync(EVENTS_FILE, JSON.stringify(obj, null, 2));
}

function getEvents() { return loadObj().events; }
function getEvent(id) { id = String(id); return loadObj().events.find(e => String(e.id) === id) || null; }
function addEvent(ev) { const obj = loadObj(); const id = String(obj.nextId++); const withId = { id, ...ev }; obj.events.push(withId); saveObj(obj); return withId; }
function updateEvent(id, patch) { id = String(id); const obj = loadObj(); const i = obj.events.findIndex(e => String(e.id) === id); if (i === -1) return null; obj.events[i] = { ...obj.events[i], ...patch }; saveObj(obj); return obj.events[i]; }
function removeEvent(id) { id = String(id); const obj = loadObj(); const i = obj.events.findIndex(e => String(e.id) === id); if (i === -1) return false; obj.events.splice(i,1); saveObj(obj); return true; }

module.exports = { getEvents, getEvent, addEvent, updateEvent, removeEvent };
