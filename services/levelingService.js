// Leveling service: wraps text + VC xp/level logic for future caching, analytics & aggregation
// Exposes uniform helpers so commands do not pull from raw utils.* modules directly.
const levelsModule = require('../utils/levels'); // exports: { levels, getXP, getLevel, addXP, saveLevels }
const vcLevelsModule = require('../utils/vcLevels'); // exports: { vcLevels, getVCXP, getVCLevel, addVCXP, saveVCLevels }
const leveling = require('../utils/leveling');

function getUserLevelData(userId, mode = 'text') {
  if (mode === 'vc') {
    return { level: vcLevelsModule.getVCLevel(userId), xp: vcLevelsModule.getVCXP(userId), mode };
  }
  return { level: levelsModule.getLevel(userId), xp: levelsModule.getXP(userId), mode };
}

module.exports = {
  // Aggregated accessor
  getUserLevelData,
  // Pass-through leveling event handler & modifier
  handleLeveling: leveling.handleLeveling,
  getUserModifier: leveling.getUserModifier,
  // Text leveling exports (data object + helpers)
  levels: levelsModule.levels,
  getXP: levelsModule.getXP,
  getLevel: levelsModule.getLevel,
  // VC leveling exports
  vcLevels: vcLevelsModule.vcLevels,
  getVCXP: vcLevelsModule.getVCXP,
  getVCLevel: vcLevelsModule.getVCLevel
};
