const fs = require('fs');
const { runtimeFile } = require('./paths');

const FILE = runtimeFile('depositProgress.json');
let data = { users: {}, day: null, resetAt: null }; // day = YYYY-MM-DD (UTC)

function load() {
	try {
		if (fs.existsSync(FILE)) {
			const raw = fs.readFileSync(FILE, 'utf8');
			const parsed = JSON.parse(raw || '{}');
			if (parsed && typeof parsed === 'object') data = { ...data, ...parsed };
		}
	} catch {}
	rolloverIfNeeded();
}

function save() {
	try { fs.writeFileSync(FILE, JSON.stringify(data, null, 2)); } catch {}
}

function todayUTC() {
	const d = new Date();
	return d.toISOString().slice(0,10); // YYYY-MM-DD
}

function nextMidnightUTC() {
	const now = new Date();
	const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0,0,0,0));
	return next.getTime();
}

function rolloverIfNeeded() {
	const day = todayUTC();
	if (data.day !== day) {
		data.day = day;
		data.resetAt = nextMidnightUTC();
		data.users = {}; // reset all daily progress
		save();
	}
}

function getProgress(userId) {
	rolloverIfNeeded();
	const u = data.users[userId];
	return { amount: u ? u.amount || 0 : 0, resetAt: data.resetAt };
}

function addProgress(userId, delta) {
	rolloverIfNeeded();
	if (!data.users[userId]) data.users[userId] = { amount: 0 };
	const amt = Math.max(0, Math.floor(Number(delta) || 0));
	if (amt > 0) {
		data.users[userId].amount += amt;
		save();
	}
	return getProgress(userId);
}

module.exports = { getProgress, addProgress, load };
