// moved: actual implementation now lives here (was utils/bank.js)
const fs = require("fs");
const path = require("path");
const { cfgPath } = require('./paths');
const { getCash, addCash, getTestingCash, addTestingCash } = require("./cash");
const { config } = require("./storage");

const BANK_FILE = cfgPath('bank.json');
const { enqueueWrite } = require('./writeQueue');

// Persistent bank balances
let bank = {};
// Testing overlay (persisted separately) mirrors shape { userId: { amount } }
const TEST_BANK_FILE = cfgPath('testingBank.json');
let testingBank = {};
try {
	if (fs.existsSync(TEST_BANK_FILE)) {
		testingBank = JSON.parse(fs.readFileSync(TEST_BANK_FILE, 'utf8')) || {};
	}
} catch { testingBank = {}; }

try {
	if (fs.existsSync(BANK_FILE)) bank = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8')) || {};
} catch { bank = {}; }

function scheduleSave() {
	enqueueWrite('bank', () => {
		try { fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2)); } catch {}
		try { fs.writeFileSync(TEST_BANK_FILE, JSON.stringify(testingBank, null, 2)); } catch {}
	});
}

function getBank(userId) {
	if (!bank[userId]) bank[userId] = { amount: 0 };
	if (!testingBank[userId]) testingBank[userId] = { amount: 0 };
	return config.testingMode ? testingBank[userId] : bank[userId];
}

function getBankAmount(userId) { return getBank(userId).amount || 0; }

function setBankAmount(userId, amount) {
	getBank(userId).amount = Math.max(0, Math.floor(amount || 0));
	scheduleSave();
	return getBankAmount(userId);
}

function addBank(userId, delta) {
	const cur = getBank(userId);
	cur.amount = Math.max(0, Math.floor((cur.amount || 0) + (delta || 0)));
	scheduleSave();
	return cur.amount;
}

function depositToBank(userId, amount) {
	amount = Math.max(0, Math.floor(amount || 0));
	if (amount <= 0) return getBankAmount(userId);
	const removed = addCash(userId, -amount);
	if (removed < 0) return getBankAmount(userId); // failed due to insufficient
	return addBank(userId, amount);
}

function withdrawFromBank(userId, amount) {
	amount = Math.max(0, Math.floor(amount || 0));
	if (amount <= 0) return getBankAmount(userId);
	const cur = getBank(userId);
	if ((cur.amount || 0) < amount) amount = cur.amount || 0;
	cur.amount = (cur.amount || 0) - amount;
	scheduleSave();
	addCash(userId, amount);
	return cur.amount;
}

module.exports = {
	getBank,
	getBankAmount,
	setBankAmount,
	addBank,
	depositToBank,
	withdrawFromBank,
	testingBank,
	bank
};
