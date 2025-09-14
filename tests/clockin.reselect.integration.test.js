const { addEvent, updateEvent, getEvent } = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');
const { handleClockInSelect } = require('../src/events/interactionEvents');

// reuse makeChannel/makeClient pattern from clockinFlow.integration.test.js
function makeChannel() {
  const messages = new Map();
  return {
    id: 'chan-reselect',
    messages: {
      async fetch(id) { return messages.get(id) || null; }
    },
    async send(payload) {
      const id = 'msg-' + Math.random().toString(36).slice(2,8);
      const msg = {
        id,
        content: payload.content || '',
        embeds: payload.embeds || [],
        components: payload.components || [],
        author: { id: 'bot' },
        delete: async function(){ messages.delete(this.id); this._deleted = true; return true; },
        edit: async function(p){ this.content = p.content || this.content; this.embeds = p.embeds || this.embeds; return this; }
      };
      messages.set(id, msg);
      return msg;
    },
    _add(msg) { messages.set(msg.id, msg); }
  };
}

function makeClient(channel) {
  return {
    channels: {
      async fetch(id) { if (id === channel.id) return channel; return null; }
    },
    user: { id: 'bot' }
  };
}

test('manualTriggerAutoMessage -> select -> re-select does not delete clock-in message unexpectedly', async () => {
  const ev = addEvent({ name: 'ClockInReselect', channelId: 'chan-reselect', autoMessages: [{ id: '1', message: 'Clockin', isClockIn: true, enabled: true, deleteAfterMs: 0 }], nextAutoId: 2 });
  // seed runtime with empty clockIn
  updateEvent(ev.id, { __clockIn: { messageIds: [], positions: {}, autoNext: {} } });
  const channel = makeChannel();
  const client = makeClient(channel);
  const interaction = { client, channel, channelId: channel.id, guild: { id: 'g' } };

  // Trigger a clock-in post
  const ok = await manualTriggerAutoMessage(interaction, ev, ev.autoMessages[0]);
  expect(ok).toBeTruthy();
  const fresh1 = getEvent(ev.id);
  expect(Array.isArray(fresh1.__clockIn.messageIds)).toBe(true);
  expect(fresh1.__clockIn.messageIds.length).toBeGreaterThan(0);
  const postedId = fresh1.__clockIn.messageIds[fresh1.__clockIn.messageIds.length-1];

  // Simulate a user selecting a role via the select menu
  const selectInteraction = {
    isStringSelectMenu: () => true,
    customId: `clockin:${ev.id}:${ev.autoMessages[0].id}`,
    message: { id: postedId, embeds: [{ title: `🕒 Staff Clock In — ${ev.name}` }] },
  // choose a position that does not require a special role in tests
  values: ['bouncer'],
    member: { id: 'u1', roles: { cache: new Map() } },
    user: { id: 'u1' },
    channel, channelId: channel.id,
    reply: async () => {}
  };
  // First selection: register u1
  await handleClockInSelect(selectInteraction);
  const fresh2 = getEvent(ev.id);
  expect(Object.values(fresh2.__clockIn.positions || {}).some(arr => Array.isArray(arr) && arr.includes('u1'))).toBe(true);

  // Re-select unregister (simulate choosing 'none') — should not delete the posted clock-in message id
  selectInteraction.values = ['none'];
  await handleClockInSelect(selectInteraction);
  const fresh3 = getEvent(ev.id);
  // messageIds should still include the postedId (no deletion)
  expect(Array.isArray(fresh3.__clockIn.messageIds)).toBe(true);
  expect(fresh3.__clockIn.messageIds.includes(postedId)).toBe(true);

  // Also ensure the channel's message still exists (fetchable)
  const msg = await channel.messages.fetch(postedId).catch(()=>null);
  expect(msg).not.toBeNull();
});
