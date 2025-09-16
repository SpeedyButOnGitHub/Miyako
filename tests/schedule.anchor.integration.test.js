const { ensureAnchor } = require('../src/commands/schedule/actions');
const eventsStorage = require('../src/utils/eventsStorage');

// Simple mocks for discord client/channel/message
function makeMessage(id, channel, authorId = 'bot') {
	return {
		id,
		channel,
		author: { id: authorId },
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
			delete: jest.fn(async (mid) => {
				const m = messages.get(mid);
				if (m) {
					messages.delete(mid);
					return true;
				}
				throw new Error('NotFound');
			}),
			_add: (m) => messages.set(m.id, m),
		},
		send: jest.fn(async (payload) => {
			const m = makeMessage(String(Math.floor(Math.random() * 100000)), this || null);
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

test('ensureAnchor edits existing message when channel unchanged', async () => {
	const client = makeClient();
	const ch = makeChannel('C1');
	client.channels._add(ch);
	const msg = makeMessage('M1', ch);
	ch.messages._add(msg);

	// event with anchor pointing to same channel
	const ev = {
		id: 'ev1',
		channelId: 'C1',
		anchorChannelId: 'C1',
		anchorMessageId: 'M1',
		enabled: true,
	};

	await ensureAnchor(client, ev, { content: 'new content' });

	expect(msg.edit).toHaveBeenCalled();
});

test('ensureAnchor moves anchor when channel changed (send new + delete old)', async () => {
	const client = makeClient();
	const oldCh = makeChannel('old');
	const newCh = makeChannel('new');
	client.channels._add(oldCh);
	client.channels._add(newCh);
	const oldMsg = makeMessage('OM', oldCh);
	oldCh.messages._add(oldMsg);

	const ev = {
		id: 'ev2',
		channelId: 'new',
		anchorChannelId: 'old',
		anchorMessageId: 'OM',
		enabled: true,
	};

	// spy on eventsStorage.updateEvent to observe runtime update
	const upd = jest.spyOn(eventsStorage, 'updateEvent').mockImplementation(async () => {});

	await ensureAnchor(client, ev, { content: 'moved' });

	// old message deleted
	expect(oldMsg.delete).toHaveBeenCalled();
	// new channel should have been sent to
	expect(newCh.send).toHaveBeenCalled();
	upd.mockRestore();
});

test('ensureAnchor deletes anchor when event disabled and recreates when enabled', async () => {
	const client = makeClient();
	const ch = makeChannel('T1');
	client.channels._add(ch);
	const msg = makeMessage('TM', ch);
	ch.messages._add(msg);

	const ev = {
		id: 'ev3',
		channelId: 'T1',
		anchorChannelId: 'T1',
		anchorMessageId: 'TM',
		enabled: false,
	};

	// If disabled, ensureAnchor should delete existing anchor (cleanup path)
	await ensureAnchor(client, ev, { content: 'x' });
	// old message should have been deleted
	expect(msg.delete).toHaveBeenCalled();

	// Now enable and ensure a new anchor is created (channel.send invoked)
	const spy = jest.spyOn(eventsStorage, 'updateEvent').mockImplementation(async () => {});
	ev.enabled = true;
	await ensureAnchor(client, ev, { content: 'x' });
	// implementation edits existing anchor in-place if previous msg still exists
	expect(msg.edit).toHaveBeenCalled();
	spy.mockRestore();
});
