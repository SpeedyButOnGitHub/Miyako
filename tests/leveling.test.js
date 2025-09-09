const { addXP, getLevel, getXP, saveLevels } = require('../utils/levels');

beforeEach(() => {
  // reset in-memory levels (direct access)
  const levelsModule = require('../utils/levels');
  Object.keys(levelsModule.levels).forEach(k => delete levelsModule.levels[k]);
});

describe('Leveling XP curve', () => {
  test('gains XP and levels up eventually', () => {
    const user = 'u1';
    let level = getLevel(user);
    expect(level).toBe(0);
    let totalXP = 0;
    // Pump XP until at least level 2
    for (let i = 0; i < 50 && level < 2; i++) {
      addXP(user, 50);
      level = getLevel(user);
      totalXP = getXP(user);
    }
    expect(level).toBeGreaterThanOrEqual(1);
    expect(totalXP).toBeGreaterThan(0);
  });
});
