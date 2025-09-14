const { addEvent, updateEvent, getEvent } = require('../src/services/scheduleService');
const { pruneClockInMessagesOnClose } = require('../src/utils/scheduler');

function makeChannel() {
  const messages = new Map();
  return {
    id: 'chan-prune',
    messages: {
      async fetch(id) { return messages.get(id) || null; }
    },
    async send(payload) {
      const id = 'msg-' + Math.random().toString(36).slice(2,8);
      const msg = { id, content: payload.content || '', author: { id: 'bot' }, delete: async ()=>{ messages.delete(id); return true; } };
      messages.set(id, msg);
      return msg;
    },
    _add(msg) { messages.set(msg.id, msg); }
  };
}

function makeClient(channel) {
  return { channels: { async fetch(id) { if (id === channel.id) return channel; return null; } }, user: { id: 'bot' } };
}

test('pruneClockInMessagesOnClose respects bot-author and TTL', async () => {
  const ev = addEvent({ name: 'PruneTest', channelId: 'chan-prune', autoMessages: [{ id: '1', isClockIn: true }] });
  // include channelId on runtime __clockIn so the scheduler helper can fetch the channel
  updateEvent(ev.id, { __clockIn: { channelId: 'chan-prune', messageIds: ['nonbot-1','bot-1'], positions: {}, autoNext: {} } });
  const ch = makeChannel();
  // Add a non-bot message and a bot message
  ch._add({ id: 'nonbot-1', author: { id: 'u-user' }, delete: async () => { throw new Error('should not delete user msg'); } });
  ch._add({ id: 'bot-1', author: { id: 'bot' }, delete: async () => { ch._deleted = ch._deleted||[]; ch._deleted.push('bot-1'); return true; } });
  const client = makeClient(ch);

  // No TTL set on notif -> nothing should be deleted
  await pruneClockInMessagesOnClose(client, getEvent(ev.id));
  expect(ch._deleted || []).toHaveLength(0);

  // Set TTL on notif -> bot message should be deleted
  const updated = getEvent(ev.id);
  updated.autoMessages[0].deleteAfterMs = 1000; // explicit TTL
  // persist
  updateEvent(ev.id, { autoMessages: updated.autoMessages });
  await pruneClockInMessagesOnClose(client, getEvent(ev.id));
  expect((ch._deleted || []).includes('bot-1')).toBe(true);
});
