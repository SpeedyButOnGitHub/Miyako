// Minimal smoke tests for warn/remove/purge command surfaces

const { handleModerationCommands } = require('../src/commands/moderation/moderationCommands');
const { handlePurgeCommand } = require('../src/commands/moderation/purge');

function fakeClient() {
  return { channels: { fetch: async () => null } };
}

function fakeGuild() {
  const roles = new Map();
  const members = new Map();
  return {
    id: 'guild1',
    roles: { cache: { has: (id) => roles.has(id) } },
    members: {
      cache: members,
      fetch: async (id) => members.get(id) || null
    },
    channels: { fetch: async () => null }
  };
}

function fakeMember(id) {
  return {
    id,
    user: { id, tag: `user#${id.slice(-4)}` },
    roles: {
      cache: new Map(),
      add: async () => {},
      remove: async () => {},
      highest: { comparePositionTo: () => -1 }
    },
    permissions: { has: () => true },
    timeout: async () => {},
    kickable: true,
    bannable: true,
  };
}

function fakeMessage({ authorId='mod1', targetId='user1' }={}) {
  const guild = fakeGuild();
  const author = { id: authorId, tag: 'mod#0001' };
  const member = fakeMember(authorId);
  const target = fakeMember(targetId);
  guild.members.cache.set(authorId, member);
  guild.members.cache.set(targetId, target);
  return {
    guild,
    guildId: guild.id,
    channelId: 'chan1',
    author,
    member,
    mentions: { members: { size: 1, first: () => target } },
    content: '.cmd',
    reply: async () => ({ id: 'm1' })
  };
}

describe('moderation smoke', () => {
  test('warn and removewarn basic surfaces execute without throwing', async () => {
    const client = fakeClient();
    const message = fakeMessage();
    await handleModerationCommands(client, message, 'warn', ['@user', 'Spamming']);
    await handleModerationCommands(client, message, 'removewarn', ['@user', '1']);
  });

  test('purge confirm path constructs confirm message without throwing', async () => {
    const client = fakeClient();
    const message = fakeMessage();
  await handlePurgeCommand(client, message, ['60']);
  });
});
