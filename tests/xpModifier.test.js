const { handleLeveling, getUserModifier } = require('../services/levelingService');
const levelingUtils = require('../utils/leveling');

// We'll simulate messages to test modifier streak growth & cap.
function mockMessage(userId, channelId = 'c1') {
  return {
    guild: { members: { fetch: async () => ({ roles: { cache: new Map() } }) } },
    channel: { id: channelId },
    author: { id: userId },
    reply: async () => {}
  };
}

describe('XP Modifier streak behavior', () => {
  const user = 'user_mod';
  const originalRandom = Math.random;
  beforeAll(() => {
    Math.random = () => 0; // deterministic lowest XP
  });
  afterAll(() => { Math.random = originalRandom; });

  test('Modifier starts at 1.0 and increases with rapid messages', async () => {
    // First message
    await levelingUtils.handleLeveling(mockMessage(user));
    expect(getUserModifier(user)).toBeCloseTo(1.0, 2);
    // Fast succession within <65s increments streak
    await levelingUtils.handleLeveling(mockMessage(user));
    // Cooldown prevents second grant if under 60s; simulate time advance
    const now = Date.now;
    let fakeNow = Date.now();
    Date.now = () => fakeNow + 61000; // jump 61s to bypass cooldown but within streak window
    await levelingUtils.handleLeveling(mockMessage(user));
    expect(getUserModifier(user)).toBeGreaterThan(1.0);
    Date.now = now; // restore
  });
});
