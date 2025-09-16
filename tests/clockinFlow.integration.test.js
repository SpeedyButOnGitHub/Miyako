const { addEvent, updateEvent } = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');

// Minimal mocks for channel/messages
function makeChannel() {
	const messages = new Map();
	return {
		id: 'chan-ci',
		messages: {
			async fetch(id) {
				return messages.get(id) || null;
			},
		},
		async send(payload) {
			const id = 'msg-' + Math.random().toString(36).slice(2, 8);
			const msg = {
				id,
				content: payload.content || '',
				embeds: payload.embeds || [],
				components: payload.components || [],
				delete: async function () {
					messages.delete(this.id);
					return true;
				},
			};
			messages.set(id, msg);
			return msg;
		},
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
		user: { id: 'bot' },
	};
}

test('manualTriggerAutoMessage for clock-in deletes older message and applies autoNext into positions', async () => {
	// create event with an autoMessages entry flagged as isClockIn
	const ev = addEvent({
		name: 'ClockInTest',
		channelId: 'chan-ci',
		autoMessages: [{ id: '1', message: 'Clockin', isClockIn: true, deleteAfterMs: 0 }],
	});
	// create fake channel with an older clock-in message
	const channel = makeChannel();
	const oldMsg = {
		id: 'old-1',
		content: 'Old clockin',
		embeds: [],
		author: { id: 'bot' },
		delete: async function () {
			channel._deleted = channel._deleted || [];
			channel._deleted.push(this.id);
			return true;
		},
	};
	channel._add(oldMsg);
	// set runtime: event had previous message
	updateEvent(ev.id, {
		__clockIn: {
			messageIds: ['old-1'],
			positions: { instance_manager: ['u-old'], manager: ['u-old2'] },
			autoNext: { 'u-auto': 'manager' },
		},
	});

	const client = makeClient(channel);
	// create a fake interaction with client for manualTriggerAutoMessage; it expects interaction.client and interaction.guild sometimes
	const interaction = { client, guild: { id: 'g1' }, channel: { id: channel.id } };

	// Call manualTriggerAutoMessage and ensure it returns true and posts a new message
	const notif = ev.autoMessages[0];
	const ok = await manualTriggerAutoMessage(interaction, ev, notif);
	expect(ok).toBeTruthy();

	// After sending, the persisted runtime should have only latest message id and positions should include the autoNext user
	const fresh = require('../src/services/scheduleService').getEvent(ev.id);
	expect(Array.isArray(fresh.__clockIn.messageIds)).toBe(true);
	expect(fresh.__clockIn.messageIds.length).toBe(1);
	// positions should have the autoNext user in manager role
	expect(Array.isArray(fresh.__clockIn.positions.manager)).toBe(true);
	expect(fresh.__clockIn.positions.manager.includes('u-auto')).toBe(true);
	// old message should have been attempted to be deleted (mock collects deletions)
	await new Promise((r) => setTimeout(r, 20));
	expect(channel._deleted && channel._deleted.includes('old-1')).toBe(true);
});
