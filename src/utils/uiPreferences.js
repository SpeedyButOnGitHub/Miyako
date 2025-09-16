const fs = require('fs');
const path = require('path');
const { dataPath } = require('./paths');

const FILE = dataPath('uiPreferences.json');

function load() {
	try {
		if (!fs.existsSync(FILE)) return {};
		return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
	} catch {
		return {};
	}
}

function save(obj) {
	try {
		const dir = path.dirname(FILE);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
		return true;
	} catch (e) {
		return false;
	}
}

function get(userId) {
	const all = load();
	return all[userId] || {};
}

function set(userId, prefs) {
	const all = load();
	all[userId] = prefs || {};
	return save(all);
}

module.exports = { get, set, load, save, FILE };
