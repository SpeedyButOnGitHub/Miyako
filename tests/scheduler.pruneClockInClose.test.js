const { pruneClockInMessagesOnClose } = require('../src/utils/scheduler');

function makeMsg(id, authorId) {
  return { id, author: { id: authorId } };
}

function makeChannel(msgs = {}) {
  const messages = {
    fetch: jest.fn((mid) => {
      const m = msgs[mid];
      if (m) return Promise.resolve(m);
      return Promise.reject(new Error('NotFound'));
    })
  };
  // attach delete behavior to message objects so deleting removes them from msgs
  for (const mid of Object.keys(msgs)) {
    const m = msgs[mid];
    m.delete = jest.fn(() => {
      delete msgs[mid];
      return Promise.resolve();
    });
  }
  return { messages };
}

function makeClient(botId, channel) {
  return {
    user: { id: botId },
    channels: { fetch: jest.fn(() => Promise.resolve(channel)) }
  };
}

describe('pruneClockInMessagesOnClose', () => {
  test('does not delete non-bot authored messages', async () => {
    const botId = 'bot-1';
    const otherId = 'user-1';
    const msg = makeMsg('m1', otherId);
    const ch = makeChannel({ 'm1': msg });
    const client = makeClient(botId, ch);
    const ev = { id: 'ev1', __clockIn: { messageIds: ['m1'], channelId: 'c1' }, autoMessages: [{ isClockIn: true, deleteAfterMs: 0 }] };
    await pruneClockInMessagesOnClose(client, ev, { force: false });
    expect(msg.delete).not.toHaveBeenCalled();
    // ensure messageIds retained
    expect(ev.__clockIn.messageIds).toContain('m1');
  });

  test('deletes bot authored messages when notif.deleteAfterMs > 0', async () => {
    const botId = 'bot-1';
    const msg = makeMsg('m2', botId);
    const ch = makeChannel({ 'm2': msg });
    const client = makeClient(botId, ch);
    const ev = { id: 'ev2', __clockIn: { messageIds: ['m2'], channelId: 'c1' }, autoMessages: [{ isClockIn: true, deleteAfterMs: 5000 }] };
    await pruneClockInMessagesOnClose(client, ev, { force: false });
    expect(msg.delete).toHaveBeenCalled();
    // messageIds should be pruned (no longer present)
    expect(ev.__clockIn.messageIds).not.toContain('m2');
  });

  test('force=true deletes bot messages regardless of TTL', async () => {
    const botId = 'bot-1';
    const msg = makeMsg('m3', botId);
    const ch = makeChannel({ 'm3': msg });
    const client = makeClient(botId, ch);
    const ev = { id: 'ev3', __clockIn: { messageIds: ['m3'], channelId: 'c1' }, autoMessages: [{ isClockIn: true, deleteAfterMs: 0 }] };
    await pruneClockInMessagesOnClose(client, ev, { force: true });
    expect(msg.delete).toHaveBeenCalled();
    expect(ev.__clockIn.messageIds).not.toContain('m3');
  });
});
