/**
 * Duplication guard test
 * Ensures messageCreate handler only processes a message once even if invoked twice rapidly.
 */
const { attachMessageEvents } = require('../src/events/messages');

describe('duplication guard', () => {
	test('same message id handled once', async () => {
		const client = {
			on: (ev, fn) => {
				if (ev === 'messageCreate') client._handler = fn;
			},
			__messageListenerAttached: false,
		};
		attachMessageEvents(client);
		// stub message object for .help command
		const replies = [];
		const message = {
			id: 'm1',
			author: { bot: false, id: 'u1' },
			content: '.help',
			member: { id: 'u1' },
			guildId: 'g1',
			channelId: 'c1',
			reply: (payload) => {
				replies.push(payload);
				return Promise.resolve({ id: 'r1', ...payload });
			},
		};
		expect(typeof client._handler).toBe('function');
		await client._handler(message);
		await client._handler(message); // second invocation should be ignored
		expect(replies.length).toBe(1);
	});
});
