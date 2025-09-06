import fs from "fs";
const LEVELS_FILE = "./config/levels.json";
let levels = fs.existsSync(LEVELS_FILE) ? JSON.parse(fs.readFileSync(LEVELS_FILE)) : {};

function getXP(userId) {
  return levels[userId]?.xp || 0;
}

function getLevel(userId) {
  const xp = getXP(userId);
  // Example: Level curve, increases required XP per level
  return Math.floor(Math.pow(xp / 50, 0.7));
}

function addXP(userId, amount) {
  if (!levels[userId]) levels[userId] = { xp: 0, level: 0 };
  levels[userId].xp += amount;
  const newLevel = getLevel(userId);
  if (newLevel > levels[userId].level) {
    levels[userId].level = newLevel;
    return newLevel;
  }
  return null;
}

function saveLevels() {
  fs.writeFileSync(LEVELS_FILE, JSON.stringify(levels, null, 2));
}

export { getXP, getLevel, addXP, saveLevels, levels };