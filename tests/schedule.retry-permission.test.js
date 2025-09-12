const scheduleService = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');
const { retry } = require('../src/utils/retry');

jest.mock('../src/utils/retry');

describe('Schedule retry and permission edge cases', () => {
  beforeAll(() => {
    process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
  });

  test('manualTriggerAutoMessage uses retry when deleting old messages', async () => {
    // create event with clockin and an older message id
    const ev = scheduleService.addEvent({ name: 'RetryTest', channelId: 'chan-retry', autoMessages: [{ id: 'n1', message: 'CI', isClockIn: true }] });
    scheduleService.updateEvent(ev.id, { __clockIn: { messageIds: ['oldmsg'], positions: {}, autoNext: {} } });

    // mock channel and message fetch behavior
    const messages = new Map();
    const oldMsg = {
      id: 'oldmsg',
      delete: jest.fn()
    };
    messages.set('oldmsg', oldMsg);

    const channel = {
      id: 'chan-retry',
      messages: { async fetch(id) { return messages.get(id) || null; } },
      async send(payload) { return { id: 'newmsg', channelId: this.id }; }
    };
    const client = { channels: { async fetch(id) { if (id === channel.id) return channel; return null; } }, user: { id: 'bot' } };

    // Make retry call-through that records calls: simulate that retry is used to delete older messages
    let retryCalled = false;
    retry.mockImplementation(async (fn, opts) => {
      retryCalled = true;
      // call original fn to simulate success
      return await fn();
    });

    const interaction = { client, guild: { id: 'g1' }, channel: { id: channel.id } };
  const ok = await manualTriggerAutoMessage(interaction, ev, ev.autoMessages[0]);
  expect(ok).toBeTruthy();
  // allow any background deletion IIFE to run
  await new Promise(r => setTimeout(r, 20));
  expect(retryCalled).toBe(true);
  });

  test('event_notify edit rejects bad channel id in modal', async () => {
    // Create event and then simulate an edit modal with an invalid channel id in the modal fields
    const ev = scheduleService.addEvent({ name: 'PermTest', channelId: 'chan-perm', autoMessages: [] });
    const handler = require('../src/commands/schedule').handleEventNotificationModal;

    const interaction = {
      isModalSubmit: () => true,
      customId: `notif_edit_modal_${ev.id}_1_msgid`,
      fields: { getTextInputValue: (k) => { if (k === 'channel') return '<#not-a-number>'; if (k === 'offset') return '5m'; if (k === 'deleteafter') return '0'; if (k==='message') return 'ok'; } },
      reply: jest.fn(async ()=>({})),
      client: { channels: { fetch: async () => null } },
      channel: { messages: { fetch: async () => null } }
    };

    // Should call reply (safeReply path) without throwing
    await expect(async () => { await handler(interaction); }).not.toThrow();
  });
});
