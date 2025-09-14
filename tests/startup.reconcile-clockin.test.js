const scheduleService = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');

function makeChannel() {
  const messages = new Map();
  return {
    id: 'chan-startup',
    messages: { async fetch(id) { return messages.get(id) || null; } },
    async send(payload) {
      const id = 'msg-' + Math.random().toString(36).slice(2,8);
      const msg = {
        id,
        content: payload.content || '',
        embeds: payload.embeds || [],
        components: payload.components || [],
        delete: async function(){ messages.delete(this.id); return true; }
      };
      messages.set(id, msg);
      return msg;
    },
    _add(msg) { messages.set(msg.id, msg); }
  };
}

function makeClient(channel) {
  return { channels: { async fetch(id) { if (id === channel.id) return channel; return null; } }, user: { id: 'bot' } };
}

describe('Startup reconcile clock-in creation', () => {
  test('creates a clock-in when an open weekly event lacks messageIds', async () => {
    // Create a weekly event scheduled for today/time now
    const now = new Date();
    const hh = now.getHours().toString().padStart(2,'0');
    const mm = now.getMinutes().toString().padStart(2,'0');
    const currentHM = `${hh}:${mm}`;
    const currentDay = now.getDay();

    const ev = scheduleService.addEvent({
      name: 'StartupWeekly',
      channelId: 'chan-startup',
      type: 'weekly',
      days: [currentDay],
      times: [currentHM],
      enabled: true,
      autoMessages: [{ id: 'c1', message: 'Clockin', isClockIn: true, enabled: true }]
    });

    // Ensure runtime overlay has empty messageIds
    scheduleService.updateEvent(ev.id, { __clockIn: { messageIds: [], positions: {}, autoNext: {} } });

    const channel = makeChannel();
    const client = makeClient(channel);
    const interaction = { client, guild: { id: 'g1' }, channel: { id: channel.id } };

    // Call manual trigger as startup would do
    const ok = await manualTriggerAutoMessage(interaction, ev, ev.autoMessages[0]);
    expect(ok).toBeTruthy();

    const fresh = scheduleService.getEvent(ev.id);
    expect(fresh.__clockIn).toBeDefined();
    expect(Array.isArray(fresh.__clockIn.messageIds)).toBeTruthy();
    expect(fresh.__clockIn.messageIds.length).toBeGreaterThan(0);
  });
});
