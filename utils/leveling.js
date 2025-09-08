const { addXP, saveLevels } = require("./levels");
const { config } = require("./storage");

const userCooldowns = new Map();
const userModifiers = new Map();

const XP_MIN = 15;
const XP_MAX = 30;
const MODIFIER_CAP = 2.0;
const MODIFIER_STEP = 0.1;

function getRandomXP() {
  return Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
}

async function handleLeveling(message, LEVEL_ROLES = {}) {
  try {
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

    const baseXP = getRandomXP();
    const totalXP = Math.floor(baseXP * modData.modifier);
    const leveledUp = addXP(userId, totalXP);
    saveLevels();

    userCooldowns.set(userId, now);

    if (leveledUp) {
      const key = String(leveledUp);
      const configured = config.levelRewards ? config.levelRewards[key] : null;
      const rewards = Array.isArray(configured)
        ? configured
        : (configured ? [configured] : (LEVEL_ROLES[leveledUp] ? [LEVEL_ROLES[leveledUp]] : []));
      if (rewards.length) {
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (member) {
          for (const roleId of rewards) {
            if (!member.roles.cache.has(roleId)) {
              await member.roles.add(roleId).catch(() => {});
            }
          }
        }
      }
      await message.reply(`🎉 Congrats <@${userId}>, you reached level ${leveledUp}!`).catch(() => {});
    }
  } catch (e) {
    // ignore leveling errors
  }
}

module.exports = { handleLeveling };
