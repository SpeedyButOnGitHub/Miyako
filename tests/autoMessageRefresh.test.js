const { refreshTrackedAutoMessages } = require('../src/commands/schedule/notifications');
const { updateEvent, addEvent } = require('../src/services/scheduleService');

// Minimal in-memory message/channel mocks
function makeChannel() {
	const messages = new Map();
	return {
		id: 'chan-test',
		messages: {
			async fetch(id) {
				return messages.get(id) || null;
			},
		},
		async send(payload) {
			const id = 'm-' + Math.random().toString(36).slice(2, 8);
			const msg = {
				id,
				content: payload.content || '',
				embeds: payload.embeds || [],
				components: payload.components || [],
				edit: async function (p) {
					this.content = p.content || this.content;
					this.embeds = p.embeds || this.embeds;
					return this;
				},
				delete: async function () {
					messages.delete(this.id);
					return true;
				},
			};
			messages.set(id, msg);
			return msg;
		},
		// helper to add fake existing message
		_add(msg) {
			messages.set(msg.id, msg);
		},
	};
}

function makeClient(channel) {
	return {
		channels: {
			async fetch(id) {
				if (id === channel.id) return channel;
				return null;
			},
		},
	};
}

test('refreshTrackedAutoMessages re-inserts mention line when forced', async () => {
	const ev = addEvent({
		name: 'TestEv',
		channelId: 'chan-test',
		autoMessages: [{ id: '1', message: 'Hello', mentions: ['111'] }],
	});
	// create fake channel and message
	const channel = makeChannel();
	// create a live message that lacks the mention line
	const live = {
		id: 'live-1',
		content: 'Hello',
		embeds: [],
		edit: async function (p) {
			this.content = p.content;
			this.embeds = p.embeds;
			return this;
		},
	};
	channel._add(live);
	// set runtime notif tracking
	updateEvent(ev.id, { __notifMsgs: { 1: { channelId: channel.id, ids: ['live-1'] } } });

	const client = makeClient(channel);
	await refreshTrackedAutoMessages(
		client,
		{
			...ev,
			__notifMsgs: { 1: { channelId: channel.id, ids: ['live-1'] } },
			autoMessages: ev.autoMessages,
		},
		{ forceForIds: ['1'] },
	);
	// after refresh, message should have mention line prepended
	const fetched = await channel.messages.fetch('live-1');
	expect(fetched.content.startsWith('<@&111>')).toBe(true);
});
