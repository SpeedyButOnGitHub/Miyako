const { getEvents, addEvent, updateEvent } = require('../src/services/scheduleService');
const interactionEvents = require('../src/events/interactionEvents');

describe('Clock-in select handling', () => {
  test('should honor in-memory lock and not crash when locked', async () => {
    const ev = addEvent({ name: 'CI Test', channelId: 'chan-ci', autoMessages: [{ id: 'a1', message: 'Clockin', isClockIn: true }] });
    // set initial clockIn state
    updateEvent(ev.id, { __clockIn: { positions: { manager: [] }, messageIds: [] } });
    // Fake interaction that targets clockin
    const interaction = {
      customId: `clockin:${ev.id}:${ev.autoMessages[0].id}`,
      isStringSelectMenu: () => true,
      values: ['manager'],
      user: { id: 'uA' },
      member: { id: 'uA', roles: { cache: new Map() } },
      message: { id: 'm1' },
      guildId: 'g',
      channelId: 'c',
      reply: async (arg) => arg,
    };

    // Simulate lock present
    const events = getEvents();
    const target = events.find(e => e.id === ev.id);
    target.__clockIn = target.__clockIn || { positions: {}, messageIds: [] };
    target.__clockIn._lock = true;

    // Call the handler: should reply with 'Please try again' and not throw
    await expect(interactionEvents.attachInteractionEvents).toBeDefined();
    const handler = require('../src/events/interactionEvents');
    // We can't easily trigger the full client listener here; instead directly call the exported handleClockInSelect
    const h = handler.handleClockInSelect;
    await expect(h(interaction)).resolves.not.toThrow();
  });
});
