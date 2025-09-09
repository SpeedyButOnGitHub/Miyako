const fs = require("fs");
const path = require("path");
const { enqueueWrite } = require('./writeQueue');

const LEVELS_FILE = path.resolve(__dirname, "../config/levels.json");

// in-memory cache
let levels = {};
try {
  if (fs.existsSync(LEVELS_FILE)) {
    levels = JSON.parse(fs.readFileSync(LEVELS_FILE, "utf8")) || {};
  }
} catch {
  levels = {};
}

let pendingSave = false;
function saveLevels() {
  if (pendingSave) return; // coalesce rapid calls
  pendingSave = true;
  enqueueWrite(LEVELS_FILE, () => {
    pendingSave = false;
    return JSON.stringify(levels, null, 2);
  }, { delay: 250 });
}

function getXP(userId) {
  return levels[userId]?.xp || 0;
}

function getLevel(userId) {
  return levels[userId]?.level || 0;
}

function xpForLevel(level) {
  // Keep in sync with profile/leaderboard: BASE_XP = 150, exponent 1/0.7
  const BASE_XP = 150;
  return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

/**
 * Add XP and return the new level if leveled up, or 0 if not.
 */
function addXP(userId, amount) {
  const cur = levels[userId] || { xp: 0, level: 0 };
  cur.xp += Math.max(0, Number(amount) || 0);

  let newLevel = 0;
  while (cur.xp >= xpForLevel(newLevel + 1)) newLevel++;
  const oldLevel = cur.level || 0;
  cur.level = newLevel;
  levels[userId] = cur;

  if (newLevel !== oldLevel) {
    // Invalidate leaderboard cache for text leveling
    try { require('../services/leaderboardService').invalidate('text'); } catch {}
  }
  saveLevels(); // always schedule save (coalesced)
  return newLevel > oldLevel ? newLevel : 0;
}

module.exports = {
  levels,
  saveLevels,
  getXP,
  getLevel,
  addXP
};