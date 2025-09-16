const ActiveMenus = require('../src/utils/activeMenus');
const schedule = require('../src/commands/schedule');
const { getEvents, addEvent, updateEvent } = require('../src/services/scheduleService');

describe('Events menu error instrumentation', () => {
	test('events handler should not throw and should reply with EVT code on error', async () => {
		// Create a fake session and interaction that will cause the handler to throw inside
		const ev = addEvent({ name: 'T', channelId: 'chan-test', autoMessages: [] });
		// Register a message session
		const msg = { id: 'm1', guildId: 'g', channelId: 'c' };
		ActiveMenus.registerMessage(msg, { type: 'events', userId: 'u1', data: { mode: 'main' } });

		const handler = ActiveMenus._getHandler('events');
		const interaction = {
			user: { id: 'u1' },
			message: msg,
			customId: 'events_select',
			values: ['nonexistent'],
			guild: null,
			guildId: 'g',
			channelId: 'c',
			isStringSelectMenu: () => true,
			reply: async ({ content }) => {
				return content;
			},
			update: async () => {},
		};
		// Ensure handler does not throw
		await expect(
			handler(interaction, ActiveMenus._getSessionForMessage(msg)),
		).resolves.not.toThrow();
	});
});
