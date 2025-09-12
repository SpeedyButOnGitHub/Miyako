const { getEvents } = require('../src/services/scheduleService');
const ActiveMenus = require('../src/utils/activeMenus');

// Simple mock message and channel
function makeMessage(authorId, channel) {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2,8),
    content: '.schedule',
    author: { id: authorId, bot: false },
    channel: {
      id: channel.id,
      guildId: channel.guildId,
      send: async (opts) => ({ id: 'sent-'+Math.random().toString(36).slice(2,6), channelId: channel.id, guildId: channel.guildId, embeds: opts.embeds, components: opts.components })
    },
    reply: async (opts) => ({ id: 'r-'+Math.random().toString(36).slice(2,6), content: opts && opts.content }),
    guildId: channel.guildId,
    channelId: channel.id,
  };
}

test('schedule command opens events menu for owner', async () => {
  process.env.OWNER_ID = process.env.OWNER_ID || 'owner-abc';
  const channel = { id: 'chan-ev', guildId: 'guild-ev' };
  const msg = makeMessage(process.env.OWNER_ID, channel);
  const handler = require('../src/commands/schedule').handleScheduleCommand;
  const sent = await handler(null, msg);
  expect(sent).toBeTruthy();
  const snap = ActiveMenus.snapshotSessions();
  const found = snap.find(s => s.type === 'events');
  expect(found).toBeTruthy();
});
