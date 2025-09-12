const { refreshTrackedAutoMessages } = require('../src/commands/schedule/notifications');
const { addEvent, updateEvent } = require('../src/services/scheduleService');

function makeChannelWithMessage(msg) {
  const messages = new Map();
  messages.set(msg.id, msg);
  return {
    id: 'chan-edge',
    messages: {
      async fetch(id) { return messages.get(id) || null; }
    },
    async send(payload) {
      const id = 'm-' + Math.random().toString(36).slice(2,8);
      const msg = { id, content: payload.content || '', embeds: payload.embeds || [] , edit: async function(p){ this.content = p.content||this.content; this.embeds = p.embeds||this.embeds; return this; } };
      messages.set(id, msg);
      return msg;
    },
    _get(id) { return messages.get(id); }
  };
}

function makeClient(channel) { return { channels: { async fetch(id) { if (id === channel.id) return channel; return null; } } } }

describe('refreshTrackedAutoMessages edge cases', () => {
  test('re-inserts mention line for JSON embed payloads and multi-embed messages when forced', async () => {
    const notif = { id: '7', messageJSON: { embeds: [{ title:'T1' }, { title:'T2' }], content: 'body' }, mentions: ['444'] };
    const ev = addEvent({ name: 'E', channelId: 'chan-edge', autoMessages: [notif] });
    const liveMsg = { id: 'live-json', content: 'body', embeds: [{ title:'T1' }, { title:'T2' }], edit: async function(p){ this.content = p.content||this.content; this.embeds = p.embeds||this.embeds; return this; } };
    const ch = makeChannelWithMessage(liveMsg);
    updateEvent(ev.id, { __notifMsgs: { '7': { channelId: ch.id, ids: ['live-json'] } } });
    const client = makeClient(ch);
    await refreshTrackedAutoMessages(client, { ...ev, __notifMsgs: { '7': { channelId: ch.id, ids: ['live-json'] } }, autoMessages: ev.autoMessages }, { forceForIds: ['7'] });
    const fetched = ch._get('live-json');
    expect(fetched.content.startsWith('<@&444>')).toBe(true);
    // Ensure embeds still present
    expect(Array.isArray(fetched.embeds) && fetched.embeds.length === 2).toBe(true);
  });
});
