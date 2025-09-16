const actions = require('../src/commands/schedule/actions');
const { generateToken, findTokenInText } = require('../src/utils/anchorToken');

// Minimal mocks for client/channel/message to capture payload
function makeMockChannel() {
	const messages = new Map();
	return {
		id: 'CH1',
		send: async function (payload) {
			// simulate returning a message-like object
			const msg = {
				id: 'M' + Math.random().toString(36).slice(2, 8),
				content: payload.content,
				components: payload.components || [],
				author: { id: 'BOT' },
				suppressEmbeds: async () => {},
			};
			messages.set(msg.id, msg);
			return msg;
		},
		messages: {
			fetch: async function (idOrOpts) {
				if (typeof idOrOpts === 'object' && idOrOpts.limit) {
					// return array-like
					return Array.from(messages.values()).slice(-1);
				}
				return messages.get(idOrOpts) || null;
			},
		},
	};
}

function makeMockClient(channel) {
	return {
		user: { id: 'BOT' },
		channels: {
			fetch: async (id) => {
				return channel;
			},
		},
	};
}

test('ensureAnchor sends a message containing encoded token when no prior anchor', async () => {
	const channel = makeMockChannel();
	const client = makeMockClient(channel);
	const ev = { id: 'ev-token-1', channelId: 'CH1', enabled: true, message: 'Hello world' };
	const msg = await actions.ensureAnchor(client, ev);
	expect(msg).toBeTruthy();
	const token = generateToken(ev.id);
	// find token using helper
	const found = findTokenInText(msg.content || '');
	expect(found).toBe(token);
});
