const ActiveMenus = require('../src/utils/activeMenus');
const appsCmd = require('../src/commands/applications');
const appsUtil = require('../src/utils/applications');

describe('Applications select menu interaction', () => {
	beforeAll(() => {
		process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
		const db = { nextAppId: 1, applications: [], submissions: [] };
		const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
		require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
	});

	test('selecting an application from the list does not error', async () => {
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
		const fakeMessage = { channel, author };
		const sent = await appsCmd.handleApplicationsCommand({ user: { tag: 'T#0' } }, fakeMessage);
		expect(channel.send).toHaveBeenCalled();

		const sentMsg = await channel.send.mock.results[0].value;
		const regMsg = { id: sentMsg.id, channelId: sentMsg.channelId, guildId: sentMsg.guildId };
		ActiveMenus.registerMessage(regMsg, {
			type: 'applications',
			userId: author.id,
			data: { view: 'root', page: 0 },
		});

		// create an app so select has something
		const a = appsUtil.addApplication({ name: 'SelectMe' });

		const interaction = {
			isButton: () => false,
			isStringSelectMenu: () => true,
			values: [String(a.id)],
			user: author,
			customId: 'appmgr_app_select_menu',
			update: jest.fn(async () => ({})),
			reply: jest.fn(async () => ({})),
			isRepliable: () => true,
			replied: false,
		};
		const handler = ActiveMenus._getHandler('applications');
		await expect(
			handler(interaction, ActiveMenus._getSessionForMessage(regMsg)),
		).resolves.not.toThrow();
		expect(interaction.update).toHaveBeenCalled();
	});
});
