/* Basic tests for applications system CRUD and submission flow.
 * These are lightweight and operate directly on the JSON data files (which are gitignored).
 */

const fs = require('fs');
const path = require('path');
const { dataDir } = require('../src/utils/paths');

const appsUtil = require('../src/utils/applications');

describe('Applications CRUD', () => {
	const appsFile = path.join(dataDir(), 'applications.json');
	const panelsFile = path.join(dataDir(), 'applicationPanels.json');

	beforeEach(() => {
		// Reset files
		fs.writeFileSync(
			appsFile,
			JSON.stringify({ nextAppId: 1, applications: [], submissions: [] }, null, 2),
		);
		fs.writeFileSync(panelsFile, JSON.stringify({ nextPanelId: 1, panels: [] }, null, 2));
	});

	test('add & fetch application', () => {
		const app = appsUtil.addApplication({
			name: 'Staff App',
			questions: [{ id: 'q1', type: 'short', label: 'Why?', required: true }],
		});
		expect(app).toBeTruthy();
		const fetched = appsUtil.getApplication(app.id);
		expect(fetched.name).toBe('Staff App');
	});

	test('update application toggles enabled', () => {
		const app = appsUtil.addApplication({ name: 'Test', enabled: true });
		appsUtil.updateApplication(app.id, { enabled: false });
		const updated = appsUtil.getApplication(app.id);
		expect(updated.enabled).toBe(false);
	});

	test('panel linking applications', () => {
		const a1 = appsUtil.addApplication({ name: 'A1' });
		const a2 = appsUtil.addApplication({ name: 'A2' });
		const p = appsUtil.addPanel({ name: 'Panel', applicationIds: [a1.id, a2.id] });
		const got = appsUtil.getPanel(p.id);
		expect(got.applicationIds).toHaveLength(2);
	});

	test('submission persistence', () => {
		const app = appsUtil.addApplication({
			name: 'Flow',
			questions: [{ id: 'q1', type: 'short', label: 'Why?', required: true }],
		});
		const sub = appsUtil.addSubmission(app.id, '123', [{ qid: 'q1', answer: 'Because' }]);
		expect(sub.id).toBeDefined();
		const list = appsUtil.listSubmissions({ appId: app.id });
		expect(list.some((s) => s.id === sub.id)).toBe(true);
	});
});
