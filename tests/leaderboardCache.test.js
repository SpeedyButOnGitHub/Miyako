const { buildLeaderboardEmbed, getEntries } = require('../src/services/leaderboardService');
const { levels } = require('../src/services/levelingService');

describe('leaderboardService cache', () => {
  test('Entries stable within TTL', () => {
    levels['u1'] = { xp: 10, level: 1 };
    levels['u2'] = { xp: 20, level: 2 };
    const first = getEntries('text');
    levels['u3'] = { xp: 30, level: 3 }; // mutate after cache
    const second = getEntries('text');
    expect(second).toBe(first); // same reference due to cache TTL
  });
});
