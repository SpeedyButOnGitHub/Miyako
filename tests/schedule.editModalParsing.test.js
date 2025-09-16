const schedule = require('../src/commands/schedule');
const scheduleService = require('../src/services/scheduleService');

describe('Edit modal parsing', () => {
	test('parses combined channel and notification role', async () => {
		// Create an event to edit
		const ev = scheduleService.addEvent({ name: 'EditParseTest', channelId: 'chan-x' });
		// Build a fake modal submit interaction
		const interaction = {
			isModalSubmit: () => true,
			customId: `event_edit_modal_${ev.id}_managerMsg`,
			fields: {
				getTextInputValue: (k) => {
					switch (k) {
						case 'name':
							return 'EditParseTest Updated';
						// Provide combined channel and role
						case 'channel':
							return `123456789012345678, 987654321098765432`;
						case 'times':
							return '12:00';
						case 'days':
							return 'Mon';
						case 'message':
							return 'Updated message';
						default:
							return '';
					}
				},
			},
			reply: jest.fn(async () => ({})),
			// need guild/channel context for some code paths; provide minimal
			channel: { messages: { fetch: async () => null } },
			guild: { id: 'g1' },
		};

		await schedule.handleEventEditModal(interaction);

		const updated = scheduleService.getEvent(ev.id);
		expect(updated).toBeTruthy();
		// notificationRole should be recorded in the persisted event
		expect(updated.notificationRole).toBe('987654321098765432');
	});
});
