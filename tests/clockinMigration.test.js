const { migrateClockIn } = require('../scripts/migrateClockInCore');

describe('clock-in migration', () => {
	test('adds missing structure', () => {
		const events = [{ id: '1', name: 'Event A' }];
		const updated = migrateClockIn(events);
		expect(updated.length).toBe(1);
		expect(events[0].__clockIn).toBeDefined();
		expect(events[0].__clockIn.positions.instance_manager).toEqual([]);
		expect(events[0].__clockIn.lastSentTs).toBeNull();
	});

	test('does not mark already-normalized event as changed', () => {
		const events = [
			{
				id: '2',
				name: 'Event B',
				__clockIn: {
					positions: {
						instance_manager: [],
						manager: [],
						bouncer: [],
						bartender: [],
						backup: [],
						maybe: [],
					},
					messageIds: ['x'],
					lastSentTs: 123,
				},
			},
		];
		const updated = migrateClockIn(events);
		expect(updated.length).toBe(0);
	});
});
