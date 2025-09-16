const { addEvent, updateEvent, getEvent } = require('../src/services/scheduleService');
const { manualTriggerAutoMessage } = require('../src/commands/schedule/actions');
const { getEvent: getEv } = require('../src/services/scheduleService');

// Create richer mocks: channel with messages map and guild/members
function makeGuildMember(id, roles = []) {
	return { id, roles: { cache: new Map(roles.map((r) => [r, { id: r }])) } };
}

function makeChannel() {
	const messages = new Map();
	return {
		id: 'chan-mem',
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
		_add(msg) {
			messages.set(msg.id, msg);
		},
		_has(id) {
			return messages.has(id);
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
		users: {
			async fetch(id) {
				return { id };
			},
		},
	};
}

function makeInteraction(client, guild, channel) {
	return { client, guild, channel, guildId: guild.id, channelId: channel.id };
}

test('member flow: selection cleared and autoNext applied on new clock-in', async () => {
	// Setup event
	const ev = addEvent({
		name: 'MemFlow',
		channelId: 'chan-mem',
		autoMessages: [{ id: '10', message: 'Clockin', isClockIn: true, deleteAfterMs: 0 }],
	});
	// Simulate existing clock-in message and positions
	updateEvent(ev.id, {
		__clockIn: { messageIds: ['old-m'], positions: { manager: ['u1'] }, autoNext: {} },
	});
	const ch = makeChannel();
	// Add old message into the channel's map so deletion can be attempted
	ch._add({
		id: 'old-m',
		content: 'old',
		embeds: [],
		delete: async function () {
			ch._deleted = ch._deleted || [];
			ch._deleted.push(this.id);
			messages && null;
			return true;
		},
	});
	const client = makeClient(ch);
	const guild = {
		id: 'g1',
		members: {
			cache: new Map([
				['u1', makeGuildMember('u1')],
				['u2', makeGuildMember('u2')],
			]),
		},
	};
	// Simulate member u2 pressing autoNext for manager
	const autoNextClock = { autoNext: { u2: 'manager' } };
	updateEvent(ev.id, { __clockIn: { ...getEvent(ev.id).__clockIn, ...autoNextClock } });

	const interaction = makeInteraction(client, guild, ch);
	const notif = getEvent(ev.id).autoMessages[0];
	// Trigger new clock-in
	const ok = await manualTriggerAutoMessage(interaction, getEvent(ev.id), notif);
	expect(ok).toBeTruthy();
	const fresh = getEvent(ev.id);
	// After new clock-in, u1 should no longer be in positions, u2 (autoNext) should be in manager
	expect(!(fresh.__clockIn.positions.manager || []).includes('u1')).toBe(true);
	expect((fresh.__clockIn.positions.manager || []).includes('u2')).toBe(true);
});
