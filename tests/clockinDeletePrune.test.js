const { addEvent, getEvent, removeEvent } = require('../src/utils/eventsStorage');
const { pruneClockInForEvent } = require('../src/utils/clockinPrune');

describe('clock-in delete prune', () => {
  test('prunes positions to autoNext and clears consumed autoNext', () => {
    // Create a temporary event
    const ev = addEvent({ name: 'Prune Test', __clockIn: { positions: { manager: ['a','b'] }, autoNext: { 'u1': 'manager', 'u2': { role:'bouncer' } }, messageIds: ['m1'] } });
    expect(ev).toBeDefined();
    const id = ev.id;

    // Run prune
    const res = pruneClockInForEvent(id, { clearConsumedAutoNext: true });
    expect(res).toBe(true);

    const updated = getEvent(id);
    expect(updated.__clockIn).toBeDefined();
    expect(updated.__clockIn.positions).toBeDefined();
    // Should have u1 in manager and u2 in bouncer
    expect(Array.isArray(updated.__clockIn.positions.manager) && updated.__clockIn.positions.manager.includes('u1')).toBe(true);
    expect(Array.isArray(updated.__clockIn.positions.bouncer) && updated.__clockIn.positions.bouncer.includes('u2')).toBe(true);
    // autoNext should be cleared
    expect(updated.__clockIn.autoNext && Object.keys(updated.__clockIn.autoNext).length).toBe(0);

    // Cleanup
    removeEvent(id);
  });
});
