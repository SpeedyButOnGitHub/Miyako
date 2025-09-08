const fs = require("fs");
const path = require("path");

const VC_LEVELS_FILE = path.resolve(__dirname, "../config/vcLevels.json");

// in-memory cache
let vcLevels = {};
try {
  if (fs.existsSync(VC_LEVELS_FILE)) {
    const raw = fs.readFileSync(VC_LEVELS_FILE, "utf8");
    vcLevels = JSON.parse(raw || "{}") || {};
  }
} catch {
  vcLevels = {};
}

function saveVCLevels() {
  try {
    const dir = path.dirname(VC_LEVELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(VC_LEVELS_FILE, JSON.stringify(vcLevels, null, 2));
  } catch {}
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
  return newLevel > oldLevel ? newLevel : 0;
}

module.exports = {
  vcLevels,
  saveVCLevels,
  getVCXP,
  getVCLevel,
  addVCXP,
};
