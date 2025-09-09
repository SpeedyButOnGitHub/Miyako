const { getVCXP, getVCLevel, vcLevels } = require('../services/levelingService');
const { addVCXP } = require('../utils/vcLevels');

describe('VC Leveling basic progression', () => {
  const user = 'u_vc';

  test('Initial level 0', () => {
    expect(getVCLevel(user)).toBe(0);
    expect(getVCXP(user)).toBe(0);
  });

  test('Add XP increments', () => {
    const target = 5000; // arbitrary XP to push several levels
    addVCXP(user, target);
    expect(getVCXP(user)).toBeGreaterThanOrEqual(target);
    expect(getVCLevel(user)).toBeGreaterThan(0);
  });
});
