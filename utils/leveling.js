const { addXP, saveLevels } = require("./levels");

// Per-user cooldown map (1 minute between XP grants)
const userCooldowns = new Map(); // userId -> timestamp
// Optional activity-based modifier per user
const userModifiers = new Map(); // userId -> { streak, modifier, lastMinute }

const XP_MIN = 15; // min XP per message
const XP_MAX = 30; // max XP per message
const MODIFIER_CAP = 2.0; // max multiplier
const MODIFIER_STEP = 0.1; // increase per active minute

function getRandomXP() {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

async function handleLeveling(message, LEVEL_ROLES = {}) {
  try {
    const userId = message.author.id;
    const now = Date.now();
    const lastXP = userCooldowns.get(userId) || 0;

    if (now - lastXP < 60 * 1000) return; // cooldown gate

    // Update modifier state
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

    // Grant XP
    const baseXP = getRandomXP();
    const totalXP = Math.floor(baseXP * modData.modifier);
    const leveledUp = addXP(userId, totalXP);
    saveLevels();

    userCooldowns.set(userId, now);

    if (leveledUp) {
      // Assign a role if mapped at this exact level
      const roleId = LEVEL_ROLES[leveledUp];
      if (roleId) {
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(roleId).catch(() => {});
      }
      await message.reply(`🎉 Congrats <@${userId}>, you reached level ${leveledUp}!`).catch(() => {});
    }
  } catch {
    // best effort; ignore leveling errors
  }
}

module.exports = { handleLeveling };
