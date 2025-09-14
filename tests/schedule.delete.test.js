// Mock notifications prior to requiring modules that import it
jest.mock('../src/commands/schedule/notifications', () => ({
  // provide an initial mock export; tests will re-require and override
  scheduleDeleteForMessage: jest.fn()
}));
// Mock retry helper so deletions are immediate in tests. Return a promise
// so callers that await retry(...) behave the same as production code.
jest.mock('../src/utils/retry', () => ({ retry: (fn) => Promise.resolve(typeof fn === 'function' ? fn() : fn) }));

// Prevent sendOnce from short-circuiting sends in tests by forcing seenRecently to false
jest.mock('../src/utils/sendOnce', () => ({ seenRecently: () => false }));

// Ensure runtime is not in testingMode for these unit tests so the scheduling
// and previous-message deletion code paths execute. Other tests may toggle
// this flag, so set it explicitly here before requiring the actions module.
const { config } = require('../src/utils/storage');
config.testingMode = false;
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');
// Re-acquire the notifications module instance that actions will use and
// ensure the scheduleDeleteForMessage function is a spy we can assert against.
const notifications = require('../src/commands/schedule/notifications');
notifications.scheduleDeleteForMessage = jest.fn();

describe('schedule delete behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // enforce non-testing runtime for these tests
    config.testingMode = false;
    notifications.scheduleDeleteForMessage = jest.fn();
  });

  test('scheduleDeleteForMessage is exported', () => {
    expect(typeof notifications.scheduleDeleteForMessage).toBe('function');
  });

  test('manualTriggerAutoMessage does not schedule delete when notif.deleteAfterMs is absent', async () => {
    const fakeClient = { channels: { fetch: jest.fn().mockResolvedValue({ send: jest.fn().mockResolvedValue({ id: 'sent1' }), messages: { fetch: jest.fn().mockResolvedValue(null) } }) }, user: { id: 'botid' } };
    const interaction = { client: fakeClient, channelId: 'cid', channel: { id: 'cid' } };
    const ev = { id: 'ev-no-ttl', channelId: 'cid', autoMessages: [] };
    const notif = { id: 'n-no-ttl', message: 'hi' };

  await expect(manualTriggerAutoMessage(interaction, ev, notif)).resolves.toBeTruthy();
  expect(notifications.scheduleDeleteForMessage).not.toHaveBeenCalled();
  });

  test('manualTriggerAutoMessage schedules delete when notif.deleteAfterMs > 0', async () => {
    const fakeChannel = {
      send: jest.fn().mockResolvedValue({ id: 'sent1' }),
      messages: { fetch: jest.fn().mockResolvedValue(null) }
    };
    const fakeClient = { channels: { fetch: jest.fn().mockResolvedValue(fakeChannel) }, user: { id: 'botid' } };
    const interaction = { client: fakeClient, channelId: 'cid', channel: { id: 'cid' } };
    const ev = { id: 'ev-ttl', channelId: 'cid', autoMessages: [] };
    const notif = { id: 'n-ttl', message: 'hi', deleteAfterMs: 60000 };

  await expect(manualTriggerAutoMessage(interaction, ev, notif)).resolves.toBeTruthy();
  expect(notifications.scheduleDeleteForMessage).toHaveBeenCalled();
  });

  test('manualTriggerAutoMessage deletes only bot-authored previous messages', async () => {
    const oldBotMsg = { id: 'old1', author: { id: 'botid' }, delete: jest.fn().mockResolvedValue(true) };
    const oldUserMsg = { id: 'old2', author: { id: 'someone' }, delete: jest.fn().mockResolvedValue(true) };
    const channel = {
      send: jest.fn().mockResolvedValue({ id: 'sent1' }),
      messages: { fetch: jest.fn().mockImplementation((mid) => mid === 'old1' ? Promise.resolve(oldBotMsg) : Promise.resolve(oldUserMsg)) }
    };
    const fakeClient = { channels: { fetch: jest.fn().mockResolvedValue(channel) }, user: { id: 'botid' } };
    const interaction = { client: fakeClient, channelId: 'cid', channel: { id: 'cid' } };
  const ev = { id: 'ev-delete-old', channelId: 'cid', autoMessages: [], __clockIn: { messageIds: ['old1','old2'] } };
  const notif = { id: 'n-delete-old', message: 'hi' };

    await expect(manualTriggerAutoMessage(interaction, ev, notif)).resolves.toBeTruthy();

    // Ensure we sent the new clock-in message and did not delete the user-posted message.
    expect(channel.send).toHaveBeenCalled();
    expect(oldUserMsg.delete).not.toHaveBeenCalled();
  });
});
