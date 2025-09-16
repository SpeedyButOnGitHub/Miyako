const fs = require('fs');
const path = require('path');
const { runtimeFile } = require('./paths');

const SCHEDULES_FILE = runtimeFile('schedules.json');
const { enqueueWrite } = require('./writeQueue');

function ensureFile() {
	const dir = path.dirname(SCHEDULES_FILE);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(SCHEDULES_FILE)) {
		const initial = { nextId: 1, schedules: [] };
		fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(initial, null, 2));
	}
}

function loadObj() {
	ensureFile();
	try {
		const data = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
		if (Array.isArray(data)) return { nextId: 1, schedules: data };
		if (!Array.isArray(data.schedules)) data.schedules = [];
		if (typeof data.nextId !== 'number') data.nextId = 1;
		return data;
	} catch {
		return { nextId: 1, schedules: [] };
	}
}

function saveObj(obj) {
	ensureFile();
	enqueueWrite(SCHEDULES_FILE, () => JSON.stringify(obj, null, 2));
}

function getSchedules() {
	return loadObj().schedules;
}
function getSchedule(id) {
	id = String(id);
	return loadObj().schedules.find((s) => String(s.id) === id) || null;
}
function addSchedule(schedule) {
	const obj = loadObj();
	const id = String(obj.nextId++);
	const withId = { id, ...schedule };
	obj.schedules.push(withId);
	saveObj(obj);
	return withId;
}
function updateSchedule(id, patch) {
	id = String(id);
	const obj = loadObj();
	const i = obj.schedules.findIndex((x) => String(x.id) === id);
	if (i === -1) return null;
	obj.schedules[i] = { ...obj.schedules[i], ...patch };
	saveObj(obj);
	return obj.schedules[i];
}
function removeSchedule(id) {
	id = String(id);
	const obj = loadObj();
	const i = obj.schedules.findIndex((x) => String(x.id) === id);
	if (i === -1) return false;
	obj.schedules.splice(i, 1);
	saveObj(obj);
	return true;
}

module.exports = { getSchedules, getSchedule, addSchedule, updateSchedule, removeSchedule };
