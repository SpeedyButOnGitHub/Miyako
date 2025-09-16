const fs = require('fs');
const path = require('path');

describe('eventsStorage sanitize', () => {
	test('channelId is not persisted to events.json', () => {
		const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'miyako-test-data-'));
		process.env.MIYAKO_RUNTIME_DIR = tmp;
		try {
			const es = require('../src/utils/eventsStorage');
			const ev = es.addEvent({ name: 't', channelId: '12345', enabled: true });
			// Read events.json and verify stored event does not have channelId
			const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'events.json'), 'utf8'));
			const stored = raw.events.find((e) => e.id === ev.id);
			expect(stored).toBeDefined();
			expect(stored.channelId).toBeUndefined();
		} finally {
			delete process.env.MIYAKO_RUNTIME_DIR;
		}
	});
});
