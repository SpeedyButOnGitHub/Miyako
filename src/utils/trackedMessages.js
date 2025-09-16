const fs = require('fs');
const path = require('path');
const { runtimeFile } = require('./paths');

const FILE = runtimeFile('trackedMessages.json');

function load() {
	try {
		if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
	} catch (e) {}
	return {};
}

function save(obj) {
	try {
		const dir = path.dirname(FILE);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
		return true;
	} catch (e) {
		try {
			require('./logger').warn('[trackedMessages] save failed', { err: e && e.message });
		} catch {}
	}
	return false;
}

function set(eventId, channelId, messageId) {
	try {
		const all = load();
		all[eventId] = { channelId: channelId || null, messageId: messageId || null, ts: Date.now() };
		save(all);
		return true;
	} catch (e) {
		return false;
	}
}

function removeByEvent(eventId) {
	try {
		const all = load();
		if (all[eventId]) {
			delete all[eventId];
			save(all);
		}
		return true;
	} catch (e) {
		return false;
	}
}

function removeByMessage(channelId, messageId) {
	try {
		const all = load();
		let changed = false;
		for (const k of Object.keys(all)) {
			const rec = all[k];
			if (rec && rec.channelId === channelId && rec.messageId === messageId) {
				delete all[k];
				changed = true;
			}
		}
		if (changed) save(all);
		return changed;
	} catch (e) {
		return false;
	}
}

function getAll() {
	return load();
}

module.exports = { set, removeByEvent, removeByMessage, getAll, FILE };
