const fs = require("fs");
const path = require("path");

const CASH_FILE = path.resolve(__dirname, "../config/cash.json");
const { enqueueWrite } = require('./writeQueue');

let cash = {};
try {
  if (fs.existsSync(CASH_FILE)) {
    try { cash = JSON.parse(fs.readFileSync(CASH_FILE, "utf8")); } catch { cash = {}; }
  }
} catch {
  cash = {};
}

// Testing overlay balances (persisted separately)
const TEST_CASH_FILE = path.resolve(__dirname, "../config/testingCash.json");
let testingCash = {};
try {
  if (fs.existsSync(TEST_CASH_FILE)) {
    testingCash = JSON.parse(fs.readFileSync(TEST_CASH_FILE, "utf8") || "{}");
  }
} catch { testingCash = {}; }

function scheduleSave() {
  enqueueWrite(CASH_FILE, () => JSON.stringify(cash, null, 2));
}

function getCash(userId) {
  return Math.max(0, Number(cash[userId]?.amount || 0));
}

function setCash(userId, amount) {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  cash[userId] = { amount: amt };
  scheduleSave();
  return amt;
}

function addCash(userId, delta) {
  const cur = getCash(userId);
  const next = Math.max(0, cur + Math.floor(Number(delta) || 0));
  return setCash(userId, next);
}

function getTopCash(limit = 10) {
  const entries = Object.entries(cash).map(([id, v]) => ({ id, amount: Math.max(0, Number(v?.amount || 0)) }));
  entries.sort((a, b) => b.amount - a.amount);
  return entries.slice(0, limit);
}

function formatCash(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n}💵`;
}

// Testing helpers (not persisted)
function getTestingCash(userId) {
  return Math.max(0, Number(testingCash[userId]?.amount || 0));
}

function addTestingCash(userId, delta) {
  const cur = getTestingCash(userId);
  const next = Math.max(0, cur + Math.floor(Number(delta) || 0));
  testingCash[userId] = { amount: next };
  try { enqueueWrite(TEST_CASH_FILE, () => JSON.stringify(testingCash, null, 2)); } catch {}
  return next;
}

function clearTestingCash() {
  testingCash = {};
  try { enqueueWrite(TEST_CASH_FILE, () => JSON.stringify(testingCash, null, 2)); } catch {}
}

module.exports = {
  cash,
  getCash,
  setCash,
  addCash,
  getTopCash,
  formatCash,
  // testing overlay
  getTestingCash,
  addTestingCash,
  clearTestingCash,
};
