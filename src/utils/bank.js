const fs = require("fs");
const { cfgPath } = require('./paths');
const { getCash, addCash, getTestingCash, addTestingCash } = require("./cash");
const { config } = require("./storage");

const BANK_FILE = cfgPath('bank.json');
const { enqueueWrite } = require('./writeQueue');

// Persistent bank balances
let bank = {};
// Testing overlay (persisted separately) value per userId = number
const TEST_BANK_FILE = cfgPath('testingBank.json');
let testingBank = {};
try {
	if (fs.existsSync(TEST_BANK_FILE)) {
		testingBank = JSON.parse(fs.readFileSync(TEST_BANK_FILE, "utf8") || "{}");
	}
} catch { testingBank = {}; }
try {
	if (fs.existsSync(BANK_FILE)) {
		const raw = fs.readFileSync(BANK_FILE, "utf8");
		bank = JSON.parse(raw || "{}");
	}
} catch {
	bank = {};
}

function scheduleSave() {
	enqueueWrite(BANK_FILE, () => JSON.stringify(bank, null, 2), { delay: 200 });
}

function getBaseLimit() {
	// Base threshold unit for soft caps and taxes
	const v = config?.bank?.baseLimit ?? 10000;
	const n = Math.max(0, Math.floor(Number(v) || 10000));
	return n || 10000;
}

function getBank(userId) {
	userId = String(userId);
	if (config.testingMode) {
		return Math.max(0, Math.floor(testingBank[userId]?.amount || 0));
	}
	return Math.max(0, Math.floor(bank[userId] || 0));
}

function setBank(userId, amount) {
	userId = String(userId);
	const n = Math.max(0, Math.floor(Number(amount) || 0));
	if (config.testingMode) {
		testingBank[userId] = { amount: n };
		try { enqueueWrite(TEST_BANK_FILE, () => JSON.stringify(testingBank, null, 2)); } catch {}
		return n;
	}
	bank[userId] = n;
	scheduleSave();
	return n;
}

function addBank(userId, delta) {
	userId = String(userId);
	const cur = getBank(userId);
	return setBank(userId, cur + Math.floor(Number(delta) || 0));
}

// Progressive tax across bands relative to base limit L
// Bands: [0..L): 0%; [L..2L): 0%->50%; [2L..3L): 50%->100%; [3L..4L): 100%->400%; [4L..inf): 400%
function marginalTaxRate(balanceAfter, L) {
	const R = balanceAfter / L; // ratio
	if (R <= 1) return 0;
	if (R <= 2) return 0.5 * (R - 1); // 0 -> 0.5
	if (R <= 3) return 0.5 + 0.5 * (R - 2); // 0.5 -> 1.0
	if (R <= 4) return 1.0 + 3.0 * (R - 3); // 1.0 -> 4.0
	return 4.0; // 400% above 4L
}

function computeTaxForDeposit(currentBank, deposit, L) {
	if (deposit <= 0) return 0;
	let remaining = deposit;
	let cur = currentBank;
	let tax = 0;
	const bandEdges = [0, L, 2 * L, 3 * L, 4 * L];

	// Helper to compute tax over a small segment [cur, cur+seg]
	const segmentTax = (start, segLen) => {
		const end = start + segLen;
		// Average of marginal rate at start and end (linear within bands by our definition)
		const r1 = marginalTaxRate(start, L);
		const r2 = marginalTaxRate(end, L);
		return segLen * (r1 + r2) / 2;
	};

	// Iterate bands up to 4L
	for (let i = 0; i < bandEdges.length - 1 && remaining > 0; i++) {
		const bandEnd = bandEdges[i + 1];
		if (cur >= bandEnd) continue;
		const canFill = Math.max(0, Math.min(remaining, bandEnd - cur));
		if (canFill > 0) {
			tax += segmentTax(cur, canFill);
			cur += canFill;
			remaining -= canFill;
		}
	}
	// If remaining beyond 4L, flat 400% tax
	if (remaining > 0) {
		tax += remaining * 4.0;
	}
	return Math.max(0, Math.floor(tax));
}

function computeNextThreshold(currentBank, L) {
	const k = Math.floor(currentBank / L);
	return (k + 1) * L;
}

// Determine the maximum deposit such that deposit + tax(deposit) <= available cash
function computeMaxAffordableDeposit(userId) {
	const uid = String(userId);
	const L = getBaseLimit();
	const bankBal = getBank(uid);
	const cash = config.testingMode ? getTestingCash(uid) : getCash(uid);
	if (cash <= 0) return { deposit: 0, tax: 0, totalCost: 0 };
	let lo = 0, hi = cash, ans = 0;
	while (lo <= hi) {
		const mid = Math.floor((lo + hi) / 2);
		const tax = computeTaxForDeposit(bankBal, mid, L);
		const total = mid + tax;
		if (total <= cash) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
	}
	const tax = computeTaxForDeposit(bankBal, ans, L);
	return { deposit: ans, tax, totalCost: ans + tax, bankAfter: bankBal + ans, baseLimit: L };
}

// Quote a deposit: how much tax, total cost, whether confirmation is recommended
function quoteDeposit(userId, amount) {
	const uid = String(userId);
	const L = getBaseLimit();
	const bankBal = getBank(uid);
	const deposit = Math.max(0, Math.floor(Number(amount) || 0));
	const tax = computeTaxForDeposit(bankBal, deposit, L);
	const totalCost = deposit + tax;
	const newBank = bankBal + deposit;
	const nextThreshold = computeNextThreshold(bankBal, L);
	const crossesSoftCap = bankBal < L && newBank > L;
	const alreadyAbove = bankBal >= L;
	const requiresConfirmation = crossesSoftCap || alreadyAbove;
	const activeCash = (config.testingMode ? getTestingCash(uid) : getCash(uid));
	return { ok: deposit > 0, deposit, tax, totalCost, newBank, bank: newBank, cashAfter: activeCash - totalCost, baseLimit: L, nextThreshold, requiresConfirmation };
}

// Compute amount to reach next threshold (no wallet check here)
function amountToNextThreshold(userId) {
	const uid = String(userId);
	const L = getBaseLimit();
	const bankBal = getBank(uid);
	const target = computeNextThreshold(bankBal, L);
	const needed = Math.max(0, target - bankBal);
	return { needed, target, baseLimit: L };
}

// Execute a deposit. If allowAboveLimit=false and confirmation would be needed, return a preview requiring confirmation.
function depositToBank(userId, amount, { allowAboveLimit = false } = {}) {
	const uid = String(userId);
	const cash = config.testingMode ? getTestingCash(uid) : getCash(uid);
	const q = quoteDeposit(uid, amount);
	if (!q.ok) return { ok: false, error: "Enter a valid positive amount." };
	if (!allowAboveLimit && q.requiresConfirmation) {
		return { ok: false, requiresConfirmation: true, quote: q };
	}
	if (cash < q.totalCost) {
		return { ok: false, error: "You don't have enough cash for this deposit and tax." };
	}
	// Apply
	if (config.testingMode) addTestingCash(uid, -q.totalCost); else addCash(uid, -q.totalCost);
	addBank(uid, q.deposit);
	const newCash = config.testingMode ? getTestingCash(uid) : getCash(uid);
	return { ok: true, moved: q.deposit, tax: q.tax, totalCost: q.totalCost, cash: newCash, bank: getBank(uid), baseLimit: q.baseLimit };
}

function withdrawFromBank(userId, amount) {
	const uid = String(userId);
	const amt = Math.max(0, Math.floor(Number(amount) || 0));
	const cur = getBank(uid);
	if (amt <= 0) return { ok: false, error: "Enter a valid positive amount." };
	if (amt > cur) return { ok: false, error: "You don't have that much in the bank." };
	addBank(uid, -amt);
	if (config.testingMode) addTestingCash(uid, amt); else addCash(uid, amt);
	const newCash = config.testingMode ? getTestingCash(uid) : getCash(uid);
	return { ok: true, moved: amt, cash: newCash, bank: getBank(uid), baseLimit: getBaseLimit() };
}

function getTopBank(limit = 10) {
	const entries = Object.entries(bank || {}).map(([userId, amount]) => ({ userId, amount: Math.max(0, Math.floor(Number(amount) || 0)) }));
	entries.sort((a, b) => b.amount - a.amount);
	return entries.slice(0, Math.max(0, Math.floor(limit || 10)));
}

module.exports = {
	getBank,
	setBank,
	addBank,
	getBaseLimit,
	quoteDeposit,
	amountToNextThreshold,
	depositToBank,
	withdrawFromBank,
	getTopBank,
	computeTaxForDeposit,
	computeMaxAffordableDeposit,
};
