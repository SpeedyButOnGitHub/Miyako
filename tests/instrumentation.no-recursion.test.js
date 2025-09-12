const { instrumentInteractionLogging } = require('../src/utils/commandLogger');

describe('instrumentInteractionLogging does not cause recursion with jest mocks', () => {
  test('wrapped mock reply does not recurse', async () => {
    // Create a fake interaction with a mocked reply implementation
    const interaction = {
      id: 'fake123',
      type: 3,
      customId: 'test:button',
      user: { id: 'u1' },
      channelId: 'c1',
      guildId: 'g1',
      isButton: () => true,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => false,
      isModalSubmit: () => false,
      __commandLoggingWrapped: false,
      reply: jest.fn().mockImplementation(async (opts) => {
        // Simulate work and return a sentinel
        return { ok: true, sent: opts };
      }),
      followUp: jest.fn().mockResolvedValue(true),
      editReply: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(true),
      client: { channels: { fetch: jest.fn().mockResolvedValue(null) } },
    };

    // Instrument - should preserve the mock without causing recursion
    instrumentInteractionLogging(interaction);

    // Call the wrapped reply and expect no errors and the mock to have been called
    const res = await interaction.reply({ content: 'hello' });
    expect(interaction.reply).toHaveBeenCalled();
    expect(res).toBeDefined();
  });
});
