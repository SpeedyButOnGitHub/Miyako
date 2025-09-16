const ActiveMenus = require('../src/utils/activeMenus');
const appsCmd = require('../src/commands/applications');
const appsUtil = require('../src/utils/applications');

describe('Applications interaction flows (mocked)', () => {
	let fakeMessage;
	beforeAll(() => {
		process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
		// Ensure a clean apps DB for tests
		const db = { nextAppId: 1, applications: [], submissions: [] };
		const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
		require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
	});

	test('create via list create button opens detail and registers session', async () => {
		// Fake message sent handler
		const channel = {
			id: 'chan1',
			send: jest.fn(async ({ embeds, components }) => ({
				id: 'm1',
				channelId: 'chan1',
				channel,
				guildId: 'g1',
				embeds,
				components,
			})),
		};
		const author = { id: process.env.OWNER_ID };
		fakeMessage = { channel, author };
		// Call command (owner check)
		const sent = await appsCmd.handleApplicationsCommand({ user: { tag: 'T#0' } }, fakeMessage);
		// Should have called channel.send once
		expect(channel.send).toHaveBeenCalled();
		// Simulate registering message by ActiveMenus (registration done in handler)
		// Now simulate pressing 'appmgr_apps' button
		const interaction = {
			isButton: () => true,
			user: author,
			customId: 'appmgr_apps',
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		// Create a session as the command would have
		const sentMsg = await channel.send.mock.results[0].value;
		// normalize to expected shape for ActiveMenus
		const regMsg = { id: sentMsg.id, channelId: sentMsg.channelId, guildId: sentMsg.guildId };
		ActiveMenus.registerMessage(regMsg, {
			type: 'applications',
			userId: author.id,
			data: { view: 'root', page: 0 },
		});
		const handler = ActiveMenus._getHandler('applications');
		await handler(interaction, ActiveMenus._getSessionForMessage(regMsg));
		expect(interaction.update).toHaveBeenCalled();
	});

	test('create app button creates new app and opens detail', async () => {
		// Simulate pressing create inside apps list
		const author = { id: process.env.OWNER_ID || 'owner' };
		const sent = { id: 'm1' };
		const session = { userId: author.id, data: { view: 'apps', page: 0 } };
		const interaction = {
			isButton: () => true,
			user: author,
			customId: 'appmgr_apps_create',
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		const handler = ActiveMenus._getHandler('applications');
		await handler(interaction, session);
		// New app should exist
		const apps = appsUtil.listApplications();
		expect(apps.length).toBeGreaterThan(0);
		expect(interaction.update).toHaveBeenCalled();
	});

	test('rename flow: showModal + awaitModalSubmit -> updates name', async () => {
		const app = appsUtil.addApplication({ name: 'OldName' });
		const author = { id: process.env.OWNER_ID || 'owner' };
		const session = { userId: author.id, data: { view: 'appDetail', appId: app.id } };
		// Mock interaction that collects a modal submission
		const submitted = {
			fields: { getTextInputValue: (k) => 'NewName' },
			reply: jest.fn(async () => ({})),
			update: jest.fn(async () => ({})),
		};
		const interaction = {
			isButton: () => true,
			user: author,
			customId: `appmgr_app_rename_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submitted),
			isRepliable: () => true,
			replied: false,
		};
		const handler = ActiveMenus._getHandler('applications');
		await handler(interaction, session);
		const updated = appsUtil.getApplication(app.id);
		expect(updated.name).toMatch(/NewName/);
	});

	test('delete flow: cancel then confirm', async () => {
		const app = appsUtil.addApplication({ name: 'ToDelete' });
		const author = { id: process.env.OWNER_ID || 'owner' };
		const session = { userId: author.id, data: { view: 'appDetail', appId: app.id } };
		// First: simulate cancel (awaitModalSubmit returns null)
		const interactionCancel = {
			isButton: () => true,
			user: author,
			customId: `appmgr_app_delete_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => null),
			reply: jest.fn(async () => ({})),
			update: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		const handler = ActiveMenus._getHandler('applications');
		await handler(interactionCancel, session);
		// App should still exist
		expect(appsUtil.getApplication(app.id)).not.toBeNull();

		// Now confirm: awaitModalSubmit returns submitted with confirm text
		const submitted = {
			fields: { getTextInputValue: (k) => 'DELETE' },
			reply: jest.fn(async () => ({})),
			update: jest.fn(async () => ({})),
			user: author,
		};
		const interactionConfirm = {
			isButton: () => true,
			user: author,
			customId: `appmgr_app_delete_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submitted),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionConfirm, session);
		expect(appsUtil.getApplication(app.id)).toBeNull();
	});
});
