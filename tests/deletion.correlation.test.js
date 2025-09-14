jest.mock('../src/utils/logger');
const logger = require('../src/utils/logger');
const { scheduleDeleteForMessage } = require('../src/commands/schedule/notifications');
const { pruneClockInMessagesOnClose } = require('../src/utils/scheduler');

// simple message mock
function makeMsg(id, createdTs, authorId, channel) {
  return {
    id,
    createdTimestamp: createdTs,
    channelId: channel && channel.id,
    author: { id: authorId },
    delete: jest.fn(() => Promise.resolve())
  };
}

function makeChannel(msgs = {}) {
  return {
    id: 'chan-1',
    messages: {
      delete: jest.fn((mid) => {
        if (msgs[mid]) { delete msgs[mid]; return Promise.resolve(); }
        return Promise.reject(new Error('NotFound'));
      }),
      fetch: jest.fn((mid) => {
        const m = msgs[mid];
        if (m) return Promise.resolve(m);
        return Promise.reject(new Error('NotFound'));
      })
    }
  };
}

function makeClient(channel) {
  return { channels: { fetch: jest.fn(() => Promise.resolve(channel)) } };
}

describe('deletion correlation ids', () => {
  beforeEach(() => jest.clearAllMocks());

  test('scheduleDeleteForMessage immediate delete logs correlationId', async () => {
    const now = Date.now();
    // message created 10 seconds ago, TTL 1000ms -> remaining <=0
    const msg = makeMsg('m-a', now - 10000, 'bot-1', { id: 'chan-1' });
    const msgs = { 'm-a': msg };
    const ch = makeChannel(msgs);
    const client = makeClient(ch);
    const notif = { deleteAfterMs: 1000, id: 'n1' };
    const ev = { id: 'ev1', __clockIn: { messageIds: ['m-a'], channelId: ch.id } };

    await scheduleDeleteForMessage(client, ch, msg, notif, ev);

    // logger.info should be called indicating immediate delete with correlationId
    expect(logger.info).toHaveBeenCalled();
    const calls = logger.info.mock.calls.map(c => c[1] || {});
    const hasCorr = calls.some(meta => meta && typeof meta.correlationId === 'string' && meta.correlationId.length);
    expect(hasCorr).toBe(true);
  });

  test('pruneClockInMessagesOnClose logs correlationId when deleting bot messages', async () => {
    const botId = 'bot-1';
    const msg = makeMsg('m-b', Date.now(), botId, { id: 'chan-1' });
    const msgs = { 'm-b': msg };
    const ch = makeChannel(msgs);
    const client = { user: { id: botId }, channels: { fetch: jest.fn(() => Promise.resolve(ch)) } };
    const ev = { id: 'ev2', __clockIn: { messageIds: ['m-b'], channelId: ch.id }, autoMessages: [{ isClockIn: true, deleteAfterMs: 5000, id: 'n2' }] };

    await pruneClockInMessagesOnClose(client, ev, { force: false });

    expect(logger.info).toHaveBeenCalled();
    const calls = logger.info.mock.calls.map(c => c[1] || {});
    const hasCorr = calls.some(meta => meta && typeof meta.correlationId === 'string' && meta.correlationId.length);
    expect(hasCorr).toBe(true);
  });
});
