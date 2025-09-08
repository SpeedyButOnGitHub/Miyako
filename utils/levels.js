const fs = require("fs");

const LEVELS_FILE = "./config/levels.json";
let levels = fs.existsSync(LEVELS_FILE) ? JSON.parse(fs.readFileSync(LEVELS_FILE)) : {};

// ===== Leveling System =====

function getXP(userId) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  return levels[userId].xp;
}

function getLevel(userId) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  return levels[userId].level;
}

function addXP(userId, amount) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  levels[userId].xp += amount;
  // Tougher curve: raise base XP to make early levels less trivial
  const BASE_XP = 150; // was 50
  const newLevel = Math.floor(Math.pow(levels[userId].xp / BASE_XP, 0.7));
  if (newLevel > levels[userId].level) {
    levels[userId].level = newLevel;
    return newLevel;
  }
  return null;
}

function saveLevels() {
  fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2));
}

module.exports = {
  getXP,
  getLevel,
  addXP,
  saveLevels,
  levels
};