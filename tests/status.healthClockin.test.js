const { runHealthChecks } = require('../src/utils/health');
const { addEvent, updateEvent } = require('../src/utils/eventsStorage');

// Minimal fake client with a guild cache containing one guild id for URL construction
function makeFakeClient(guildId) {
	const cache = new Map([[guildId, { id: guildId }]]);
	// mimic discord.js Collection.first()
	cache.first = () => {
		for (const v of cache.values()) return v;
		return undefined;
	};
	return { guilds: { cache } };
}

describe('health checks', () => {
	test('emits staffClockIn when __clockIn.messageIds present', async () => {
		// Create a temporary event
		const ev = addEvent({
			name: 'Test Event',
			channelId: '1234',
			enabled: true,
			times: ['00:00'],
			days: [0],
			type: 'multi-daily',
		});
		// Simulate runtime clock-in message ids
		const clk = '999999999999999999';
		updateEvent(ev.id, { __clockIn: { messageIds: [clk], channelId: '1234', positions: {} } });

		const client = makeFakeClient('5555');
		const res = await runHealthChecks(client);
		const found =
			Array.isArray(res) && res.some((r) => r.kind === 'staffClockIn' && r.id === ev.id);
		expect(found).toBe(true);
	});
});
