const ActiveMenus = require('../src/utils/activeMenus');
const scheduleService = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');

// Reuse clockin integration utilities
function makeChannel() {
  const messages = new Map();
  return {
    id: 'chan-test',
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

describe('Schedule notifications and clock-in select tests', () => {
  test('event_notify button path and clockin select update positions', async () => {
    // add event with an autoMessage clock-in
    const ev = scheduleService.addEvent({ name: 'SchedTest', channelId: 'chan-test', autoMessages: [{ id: 'a1', message: 'Clockin', isClockIn: true }] });
    const channel = makeChannel();
    const client = makeClient(channel);

    // Put an old clock-in message id into event runtime so manualTriggerAutoMessage will attempt deletion
    scheduleService.updateEvent(ev.id, { __clockIn: { messageIds: ['old1'], positions: {}, autoNext: {} } });

    // create fake interaction object used by manualTriggerAutoMessage
    const interaction = { client, guild: { id: 'g1' }, channel: { id: channel.id } };
    const ok = await manualTriggerAutoMessage(interaction, ev, ev.autoMessages[0]);
    expect(ok).toBeTruthy();

    // Simulate a clock-in select interaction: customId 'clockin:<evId>:<autoId>' selecting a role mapping value
    const selectCustom = `clockin:${ev.id}:${ev.autoMessages[0].id}`;
    const selectInteraction = {
      isStringSelectMenu: () => true,
      customId: selectCustom,
      user: { id: 'uX' },
      values: ['manager'],
      reply: jest.fn(async ()=>({})),
      update: jest.fn(async ()=>({})),
      isRepliable: () => true,
      replied: false
    };

    // Call the schedule handler directly by requiring the schedule command module
    const sched = require('../src/commands/schedule');
    if (sched.handleClockInSelect) {
      await sched.handleClockInSelect(selectInteraction);
      expect(selectInteraction.reply).toHaveBeenCalled();
      const fresh = scheduleService.getEvent(ev.id);
      expect(fresh.__clockIn.positions.manager.includes('uX')).toBeTruthy();
    } else {
      // If handler not present, ensure code path isn't missing
      expect(typeof sched.handleClockInSelect).toBe('function');
    }
  });
});
