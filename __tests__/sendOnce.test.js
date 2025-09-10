const { seenRecently } = require('../utils/sendOnce');

describe('sendOnce TTL guard', () => {
  test('returns false on first sight, true if seen within TTL, then false after TTL', async () => {
    const key = 'unit:abc';
    const ttl = 100; // 100ms TTL
    const first = seenRecently(key, ttl);
    expect(first).toBe(false);
    const second = seenRecently(key, ttl);
    expect(second).toBe(true);
    // wait past TTL
    await new Promise(r => setTimeout(r, ttl + 30));
    const third = seenRecently(key, ttl);
    expect(third).toBe(false);
  });
});
