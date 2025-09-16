// Minimal mocks for channel/message system
class MockMessage {
	constructor(id, ch) {
		this.id = id;
		this.channel = ch;
		this.deleted = false;
		this.content = '';
		this.embeds = [];
	}
	async edit(p) {
		this.content = p.content || this.content;
		this.embeds = p.embeds || this.embeds;
		return this;
	}
	async delete() {
		this.deleted = true;
		return true;
	}
}
class MockChannel {
	constructor() {
		this.messages = new Map();
	}
	async fetch(id) {
		return this.messages.get(id) || null;
	}
	async messages_fetch(id) {
		return this.messages.get(id) || null;
	}
}

// Jest-like test harness minimal
const { addEvent, updateEvent, getEvent } = require('../src/utils/eventsStorage');
const { handleClockInSelect } = require('../src/events/interactionEvents');

test('handleClockInSelect does not delete previous user-authored message on unregister', async () => {
	const ev = addEvent({
		name: 'Test Event',
		channelId: 'c1',
		times: ['12:00'],
		days: [0],
		autoMessages: [{ id: '1', isClockIn: true, enabled: true }],
		nextAutoId: 2,
	});
	updateEvent(ev.id, {
		__clockIn: { messageIds: ['m-old'], positions: {}, autoNext: {}, channelId: 'c1' },
	});
	const mockChannel = {
		messages: {
			fetch: async (id) => {
				if (id === 'm-old')
					return {
						id: 'm-old',
						author: { id: 'u1' },
						delete: async () => {
							throw new Error('Should not delete user message');
						},
					};
				return null;
			},
		},
		id: 'c1',
	};
	const interaction = {
		isStringSelectMenu: () => true,
		customId: `clockin:${ev.id}:1`,
		message: { id: 'm-old', embeds: [{ title: '🕒 Staff Clock In — Test Event' }] },
		values: ['none'],
		member: { id: 'u1', roles: { cache: new Map() } },
		user: { id: 'u1' },
		channel: mockChannel,
		channelId: 'c1',
		reply: async () => {},
	};
	await handleClockInSelect(interaction);
	const after = getEvent(ev.id);
	expect(Array.isArray(after.__clockIn.messageIds)).toBe(true);
	expect(after.__clockIn.messageIds.includes('m-old')).toBe(true);
});
