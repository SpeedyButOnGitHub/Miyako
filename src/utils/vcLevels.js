const fs = require("fs");
const { enqueueWrite } = require('./writeQueue');
const { dataDir } = require('./paths');
const path = require('path');
const IS_TEST = process.env.NODE_ENV === 'test';

// Use a separate file during tests to avoid polluting real data (or skip I/O entirely)
// Treat vcLevels as volatile runtime data: keep under main runtime file but aggregate backups to avoid churn.
const VC_LEVELS_FILE = IS_TEST ? path.join(dataDir(), 'testingVcLevels.json') : path.join(dataDir(), 'vcLevels.json');

// in-memory cache
let vcLevels = {};
try {
	if (!IS_TEST && fs.existsSync(VC_LEVELS_FILE)) {
		const raw = fs.readFileSync(VC_LEVELS_FILE, "utf8");
		vcLevels = JSON.parse(raw || "{}") || {};
	} else {
		vcLevels = {};
	}
} catch {
	vcLevels = {};
}

let pendingSave = false;
function saveVCLevels() {
	if (pendingSave) return;
	pendingSave = true;
	if (IS_TEST) {
		// Skip disk I/O in tests for stability
		pendingSave = false;
		return;
	}
	enqueueWrite(VC_LEVELS_FILE, () => {
		pendingSave = false;
		return JSON.stringify(vcLevels, null, 2);
	}, { delay: 250, aggregateBackups: true });
}

function getVCXP(userId) {
	return vcLevels[userId]?.xp || 0;
}

function getVCLevel(userId) {
	return vcLevels[userId]?.level || 0;
}

function xpForLevel(level) {
	const BASE_XP = 150;
	return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

function addVCXP(userId, amount) {
	if (!Number.isFinite(amount) || amount <= 0) return 0;
	const cur = vcLevels[userId] || { xp: 0, level: 0 };
	cur.xp = Math.max(0, (cur.xp || 0) + amount);
	let newLevel = cur.level || 0;
	while (cur.xp >= xpForLevel(newLevel + 1)) newLevel++;
	const oldLevel = cur.level || 0;
	if (newLevel !== cur.level) cur.level = newLevel;
	vcLevels[userId] = cur;
	saveVCLevels();
	return newLevel > oldLevel ? newLevel : 0;
}

module.exports = {
	vcLevels,
	saveVCLevels,
	getVCXP,
	getVCLevel,
	addVCXP,
};
