/** Command logger basic test */
const { start, finish, diffExpected, normalizeMsgShape } = require('../src/utils/commandLogger');

describe('commandLogger', () => {
  test('start/finish cycles without throwing and diff works', () => {
    const ctx = start({ name:'help', userId:'u1', channelId:'c1', guildId:'g1', input:{ content:'.help'} });
    const fakeMsg = { id:'m2', content:'Help output', embeds:[], components:[] };
    finish({ channels:{ fetch:()=>({}) } }, ctx, { actual: normalizeMsgShape(fakeMsg) });
    const diff = diffExpected(normalizeMsgShape(fakeMsg), { content:'Different', embedsCount:0, componentsCount:0 });
    expect(Array.isArray(diff)).toBe(true);
    expect(diff.length).toBeGreaterThan(0);
  });
});
