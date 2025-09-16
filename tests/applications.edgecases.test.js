const ActiveMenus = require('../src/utils/activeMenus');
const appsUtil = require('../src/utils/applications');
const appsCmd = require('../src/commands/applications');

describe('Applications edge-case modal inputs', () => {
	beforeAll(() => {
		process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
		// Reset apps DB
		const db = { nextAppId: 1, applications: [], submissions: [] };
		const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
		require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
	});

	test('approles: empty submission clears roles', async () => {
		const author = { id: process.env.OWNER_ID };
		const app = appsUtil.addApplication({ name: 'EdgeRoles', managerRoles: ['1', '2'] });
		const handler = ActiveMenus._getHandler('applications');

		// Simulate entering appRoles view and submitting empty roles field (should clear)
		const submittedEmpty = {
			fields: { getTextInputValue: (k) => '' },
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionEmpty = {
			isButton: () => true,
			user: author,
			customId: `approles_manager_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submittedEmpty),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionEmpty, {
			userId: author.id,
			data: { view: 'appRoles', appId: app.id },
		});
		const after = appsUtil.getApplication(app.id);
		expect(Array.isArray(after.managerRoles)).toBe(true);
		// empty input should result in empty array
		expect(after.managerRoles.length).toBe(0);
	});

	test('appmsg: invalid JSON is stored as plain text', async () => {
		const author = { id: process.env.OWNER_ID };
		const app = appsUtil.addApplication({ name: 'EdgeMsg' });
		const handler = ActiveMenus._getHandler('applications');

		const submittedBadJson = {
			fields: { getTextInputValue: (k) => '{ not: valid json }' },
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionMsg = {
			isButton: () => true,
			user: author,
			customId: `appmsg_edit_accept_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submittedBadJson),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionMsg, { userId: author.id, data: { view: 'appMsgs', appId: app.id } });
		const updated = appsUtil.getApplication(app.id);
		expect(typeof updated.acceptMessage).toBe('string');
		expect(updated.acceptMessage).toMatch(/not: valid json/);
	});

	test('appq: add question with invalid required flag defaults to required=true', async () => {
		const author = { id: process.env.OWNER_ID };
		const app = appsUtil.addApplication({ name: 'EdgeQ' });
		const handler = ActiveMenus._getHandler('applications');

		const submitted = {
			fields: {
				getTextInputValue: (k) => {
					if (k === 'label') return 'Test?';
					if (k === 'type') return 'short';
					if (k === 'required') return 'maybe';
				},
			},
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionAdd = {
			isButton: () => true,
			user: author,
			customId: `appq_add_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submitted),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionAdd, {
			userId: author.id,
			data: { view: 'questions', appId: app.id },
		});

		const qlist = appsUtil.getApplication(app.id).questions;
		expect(qlist.length).toBeGreaterThan(0);
		const q = qlist[qlist.length - 1];
		// 'maybe' does NOT match /^y(es)?$/i, so required should be false
		expect(q.required).toBe(false);
	});
});
