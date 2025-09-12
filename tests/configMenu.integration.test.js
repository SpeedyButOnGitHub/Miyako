const ActiveMenus = require('../src/utils/activeMenus');
const { attachMessageEvents } = require('../src/events/messages');

// Minimal mocks for client and message to exercise the .config command path
function makeClient() {
  return {
    __messageListenerAttached: false,
    on: (ev, fn) => { if (ev === 'messageCreate') { global.__msgHandler = fn; } },
    channels: { fetch: async () => null },
    guilds: { cache: new Map() },
  };
}

function makeMessage(content, authorId, channel) {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2,8),
    content,
    author: { id: authorId, bot: false },
    channel: {
      send: async (opts) => {
        const sent = { id: 'sent-'+Math.random().toString(36).slice(2,6), channelId: channel.id, guildId: channel.guildId, embeds: opts.embeds, components: opts.components };
        // mirror to top-level properties like a real Message
        sent.channelId = channel.id;
        sent.guildId = channel.guildId;
        return sent;
      },
      id: channel.id,
    },
    reply: async (opts) => ({ id: 'r-'+Math.random().toString(36).slice(2,6), content: opts && opts.content }),
    guildId: channel.guildId,
    channelId: channel.id,
  };
}

test('config command triggers config menu for owner', async () => {
  // Arrange
  process.env.OWNER_ID = 'owner-123';
  const client = makeClient();
  const channel = { id: 'chan-1', guildId: 'guild-1' };
  // Capture any logger.error calls to expose internal errors
  try { require('../src/utils/logger').error = (...a) => { global.__lastLogger = a; }; } catch {}
  // Act - call the handler directly for deterministic behavior
  const handler = require('../src/commands/configMenu').handleMessageCreate;
  const msg = makeMessage('.config', 'owner-123', channel);
  const sent = await handler(msg);
  expect(sent).toBeTruthy();

  // Assert - if logger captured an error, surface it for debugging
  if (global.__lastLogger) {
    // Fail with the error details
    const args = global.__lastLogger;
    throw new Error('Logger.error called during command: ' + JSON.stringify(args));
  }

  // ActiveMenus should have registered the sent message session
  const snap = ActiveMenus.snapshotSessions();
  expect(Array.isArray(snap)).toBe(true);
  const found = snap.find(s => s.type === 'configMenu');
  expect(found).toBeTruthy();
});
