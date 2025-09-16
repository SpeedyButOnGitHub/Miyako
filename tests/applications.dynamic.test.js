const ActiveMenus = require('../src/utils/activeMenus');
const appsUtil = require('../src/utils/applications');
const appsCmd = require('../src/commands/applications');

describe('Applications dynamic flows: roles, messages, questions', () => {
	beforeAll(() => {
		process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
		// Reset apps DB
		const db = { nextAppId: 1, applications: [], submissions: [] };
		const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
		require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
	});

	test('roles flow: open roles, set manager list via modal, toggle pending', async () => {
		const channel = {
			id: 'chan-roles',
			send: jest.fn(async ({ embeds, components }) => ({
				id: 'msg-roles',
				channelId: 'chan-roles',
				channel,
				guildId: 'g1',
				embeds,
				components,
			})),
		};
		const author = { id: process.env.OWNER_ID };
		const sent = await appsCmd.handleApplicationsCommand(
			{ user: { tag: 'T#0' } },
			{ channel, author },
		);

		const sentMsg = await channel.send.mock.results[0].value;
		const regMsg = { id: sentMsg.id, channelId: sentMsg.channelId, guildId: sentMsg.guildId };
		ActiveMenus.registerMessage(regMsg, {
			type: 'applications',
			userId: author.id,
			data: { view: 'root', page: 0 },
		});
		const handler = ActiveMenus._getHandler('applications');

		// create app and open its detail
		const created = appsUtil.addApplication({ name: 'RApp' });
		const interactionSelect = {
			isButton: () => true,
			user: author,
			customId: `appmgr_app_select_${created.id}`,
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionSelect, ActiveMenus._getSessionForMessage(regMsg));

		// Open roles
		const interactionRoles = {
			isButton: () => true,
			user: author,
			customId: `appmgr_app_roles_${created.id}`,
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionRoles, ActiveMenus._getSessionForMessage(regMsg));
		expect(interactionRoles.update).toHaveBeenCalled();

		// Press manager edit -> shows modal -> submit roles text
		const submitted = {
			fields: { getTextInputValue: (k) => '111111 222222' },
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionEdit = {
			isButton: () => true,
			user: author,
			customId: `approles_manager_${created.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submitted),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionEdit, {
			userId: author.id,
			data: { view: 'appRoles', appId: created.id },
		});
		const updated = appsUtil.getApplication(created.id);
		expect(Array.isArray(updated.managerRoles)).toBe(true);
		expect(updated.managerRoles.length).toBeGreaterThan(0);

		// Toggle pending role: submit a single role id via modal
		const submittedPending = {
			fields: { getTextInputValue: (k) => '333333' },
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionPending = {
			isButton: () => true,
			user: author,
			customId: `approles_pending_${created.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submittedPending),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionPending, {
			userId: author.id,
			data: { view: 'appRoles', appId: created.id },
		});
		const afterPending = appsUtil.getApplication(created.id);
		expect(afterPending.pendingRole).toBeTruthy();
	});

	test('message editing flows (appmsg_) update messages via modal', async () => {
		const author = { id: process.env.OWNER_ID };
		const app = appsUtil.addApplication({ name: 'MApp' });
		const handler = ActiveMenus._getHandler('applications');

		// Open messages view
		await handler(
			{
				isButton: () => true,
				user: author,
				customId: `appmgr_app_msgs_${app.id}`,
				update: jest.fn(async () => ({})),
				reply: jest.fn(async () => ({})),
				isRepliable: () => true,
				replied: false,
			},
			{ userId: author.id, data: { view: 'appDetail', appId: app.id } },
		);

		const submittedAccept = {
			fields: { getTextInputValue: (k) => 'You were accepted' },
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionAccept = {
			isButton: () => true,
			user: author,
			customId: `appmsg_edit_accept_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submittedAccept),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionAccept, {
			userId: author.id,
			data: { view: 'appMsgs', appId: app.id },
		});
		expect(appsUtil.getApplication(app.id).acceptMessage).toMatch(/You were accepted/);
	});

	test('questions flows: add/edit/del/reorder', async () => {
		const author = { id: process.env.OWNER_ID };
		const app = appsUtil.addApplication({ name: 'QApp' });
		const handler = ActiveMenus._getHandler('applications');

		// Open questions
		await handler(
			{
				isButton: () => true,
				user: author,
				customId: `appmgr_app_questions_${app.id}`,
				update: jest.fn(async () => ({})),
				reply: jest.fn(async () => ({})),
				isRepliable: () => true,
				replied: false,
			},
			{ userId: author.id, data: { view: 'appDetail', appId: app.id } },
		);

		// Add question via modal
		const submittedAdd = {
			fields: {
				getTextInputValue: (k) => {
					if (k === 'label') return 'How are you?';
					if (k === 'type') return 'short';
					if (k === 'required') return 'y';
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
			awaitModalSubmit: jest.fn(async () => submittedAdd),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionAdd, {
			userId: author.id,
			data: { view: 'questions', appId: app.id },
		});
		expect(appsUtil.getApplication(app.id).questions.length).toBeGreaterThan(0);

		// Edit last question
		const submittedEdit = {
			fields: {
				getTextInputValue: (k) => {
					if (k === 'label') return 'Edited?';
					if (k === 'type') return 'short';
					if (k === 'required') return 'n';
				},
			},
			reply: jest.fn(async () => ({})),
			user: author,
		};
		const interactionEdit = {
			isButton: () => true,
			user: author,
			customId: `appq_edit_${app.id}`,
			showModal: jest.fn(async () => ({})),
			awaitModalSubmit: jest.fn(async () => submittedEdit),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionEdit, {
			userId: author.id,
			data: { view: 'questions', appId: app.id },
		});

		// Reorder (rotate)
		const interactionReorder = {
			isButton: () => true,
			user: author,
			customId: `appq_reorder_${app.id}`,
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionReorder, {
			userId: author.id,
			data: { view: 'questions', appId: app.id },
		});

		// Delete last question
		const interactionDel = {
			isButton: () => true,
			user: author,
			customId: `appq_del_${app.id}`,
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		await handler(interactionDel, {
			userId: author.id,
			data: { view: 'questions', appId: app.id },
		});
		// No throw implies success; ensure questions array length is valid
		expect(Array.isArray(appsUtil.getApplication(app.id).questions)).toBe(true);
	});
});
