const { handleModerationCommands } = require('../src/commands/moderation/moderationCommands');

function fakeMember(id) {
  return {
    id,
    user: { id, tag: `user#${String(id).slice(-4)}` },
    roles: {
      cache: new Map(),
      add: async () => {},
      remove: async () => {},
      highest: { comparePositionTo: () => -1 }
    },
    permissions: { has: () => true },
    timeout: async () => {},
    kick: async () => {},
    ban: async () => {},
    kickable: true,
    bannable: true,
  };
}

function fakeGuild() {
  const members = new Map();
  return {
    id: 'guild1',
    members: {
      cache: members,
      fetch: async (id) => members.get(id) || null
    },
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

describe('moderation actions smoke', () => {
  const client = { channels: { fetch: async () => null } };

  test('mute and unmute execute surfaces', async () => {
    const message = fakeMessage();
    await handleModerationCommands(client, message, 'mute', ['@user', '10m', 'Testing']);
    await handleModerationCommands(client, message, 'unmute', ['@user']);
  });

  test('kick and ban execute surfaces', async () => {
    const message = fakeMessage();
    await handleModerationCommands(client, message, 'kick', ['@user', 'Be nice']);
    await handleModerationCommands(client, message, 'ban', ['@user', 'Serious reason']);
  });

  test('timeout executes surface', async () => {
    const message = fakeMessage();
    await handleModerationCommands(client, message, 'timeout', ['@user', '5m', 'Cool down']);
  });
});
