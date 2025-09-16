const { ensureAnchor } = require('../src/commands/schedule/actions');

function makeMessage(id, channel, authorId = 'bot', components) {
	return {
		id,
		channel,
		author: { id: authorId },
		components: components || [],
		edit: jest.fn().mockResolvedValue(true),
		delete: jest.fn().mockResolvedValue(true),
		suppressEmbeds: jest.fn().mockResolvedValue(true),
	};
}

function makeChannel(id) {
	const messages = new Map();
	return {
		id,
		messages: {
			fetch: jest.fn(async (mid) => messages.get(mid) || Promise.reject(new Error('NotFound'))),
			_add: (m) => messages.set(m.id, m),
		},
		send: jest.fn(async (payload) => {
			// mimic discord.js message object with components attached
			const m = makeMessage(
				String(Math.floor(Math.random() * 100000)),
				this || null,
				'bot',
				payload.components || [],
			);
			messages.set(m.id, m);
			return m;
		}),
	};
}

function makeClient() {
	const channels = new Map();
	return {
		user: { id: 'bot' },
		channels: {
			fetch: jest.fn(async (cid) => channels.get(cid) || Promise.reject(new Error('NotFound'))),
			_add: (c) => channels.set(c.id, c),
		},
	};
}

beforeEach(() => jest.resetAllMocks());

test('ensureAnchor includes Notify me button when notificationRole is set (send path)', async () => {
	const client = makeClient();
	const ch = makeChannel('CN');
	client.channels._add(ch);

	const ev = { id: 'evNotify1', channelId: 'CN', enabled: true, notificationRole: 'R123' };

	const msg = await ensureAnchor(client, ev, { content: 'hello' });
	// should have used channel.send
	expect(ch.send).toHaveBeenCalled();
	// returned mock message should have components with a button having customId event_notify_<id>
	const expectedId = `event_notify_${ev.id}`;
	const found =
		msg && Array.isArray(msg.components)
			? msg.components.some((r) =>
					Array.isArray(r.components)
						? r.components.some((c) => c.customId === expectedId)
						: r.components && r.components.customId === expectedId,
				)
			: false;
	expect(found).toBe(true);
});

test('ensureAnchor includes Notify me button when notificationRole is set (edit path)', async () => {
	const client = makeClient();
	const ch = makeChannel('CE');
	client.channels._add(ch);
	const msg = makeMessage('MEDIT', ch, 'bot', []);
	// capture edit payload for assertions
	let editArg = null;
	msg.edit = jest.fn(async (payload) => {
		editArg = payload;
		return true;
	});
	ch.messages._add(msg);

	const ev = {
		id: 'evNotify2',
		channelId: 'CE',
		anchorChannelId: 'CE',
		anchorMessageId: 'MEDIT',
		enabled: true,
		notificationRole: 'R999',
	};

	const returned = await ensureAnchor(client, ev, { content: 'edit me' });
	// ensure edit was attempted (and that expectedButtonId triggered edit logic if missing)
	expect(msg.edit).toHaveBeenCalled();
	const expectedId = `event_notify_${ev.id}`;
	// Ensure the edit payload included the expected button customId
	const payload = editArg;
	const found =
		payload && Array.isArray(payload.components)
			? payload.components.some((r) =>
					Array.isArray(r.components)
						? r.components.some((c) => c.customId === expectedId || c.custom_id === expectedId)
						: r.components &&
							(r.components.customId === expectedId || r.components.custom_id === expectedId),
				)
			: false;
	expect(found).toBe(true);
});
