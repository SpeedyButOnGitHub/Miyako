<<<<<<< HEAD
const { addXP, saveLevels } = require("./levels");
const { config } = require("./storage");

const userCooldowns = new Map();
const userModifiers = new Map();

function getUserModifier(userId) {
  const data = userModifiers.get(userId);
  return data && typeof data.modifier === 'number' ? data.modifier : 1.0;
}

// Slightly lower per-message XP to slow overall progression
const XP_MIN = 8;
const XP_MAX = 16;
const MODIFIER_CAP = 2.0;
const MODIFIER_STEP = 0.1;

function getRandomXP() {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

async function handleLeveling(message, LEVEL_ROLES = {}) {
  try {
  if (!message.guild) return; // guild-only leveling
    // Channel gating for leveling
    const chId = message.channel?.id;
    if (!chId) return;
    const mode = config.levelingMode || "blacklist";
    const list = Array.isArray(config.levelingChannelList) ? config.levelingChannelList : [];
    const inList = list.includes(chId);
    if (mode === "blacklist" ? inList : !inList) {
      return; // do not award XP here
    }

    const userId = message.author.id;
    const now = Date.now();
    const lastXP = userCooldowns.get(userId) || 0;

    if (now - lastXP < 60 * 1000) return; // cooldown gate

    let modData = userModifiers.get(userId) || { streak: 0, modifier: 1.0, lastMinute: 0 };
    if (modData.lastMinute && now - modData.lastMinute <= 65 * 1000) {
      modData.streak += 1;
      modData.modifier = Math.min(MODIFIER_CAP, 1.0 + modData.streak * MODIFIER_STEP);
    } else {
      modData.streak = 0;
      modData.modifier = 1.0;
    }
    modData.lastMinute = now;
    userModifiers.set(userId, modData);

    // Skip XP if member has a blacklisted role
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    const roleBlacklist = Array.isArray(config.roleXPBlacklist) ? config.roleXPBlacklist : [];
    if (roleBlacklist.length && member.roles.cache.some(r => roleBlacklist.includes(r.id))) {
      return;
    }

    const baseXP = getRandomXP();
    const globalMult = typeof config.globalXPMultiplier === 'number' && Number.isFinite(config.globalXPMultiplier) ? Math.max(0, config.globalXPMultiplier) : 1.0;
    const totalXP = Math.floor(baseXP * modData.modifier * globalMult);
    const leveledUp = addXP(userId, totalXP);
    saveLevels();

    userCooldowns.set(userId, now);

    if (leveledUp) {
      const key = String(leveledUp);
      const configured = config.levelRewards ? config.levelRewards[key] : null;
      const rewards = Array.isArray(configured)
        ? configured
        : (configured ? [configured] : (LEVEL_ROLES[leveledUp] ? [LEVEL_ROLES[leveledUp]] : []));
      if (rewards.length && member) {
        for (const roleId of rewards) {
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId).catch(() => {});
          }
        }
      }
      await message.reply(`🎉 Congrats <@${userId}>, you reached level ${leveledUp}!`).catch(() => {});
    }
  } catch (e) {
    // ignore leveling errors
  }
}

module.exports = { handleLeveling, getUserModifier };
=======
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
>>>>>>> 8ac8742b5a91dd4a92460174d1c4c050e4ab6b92
