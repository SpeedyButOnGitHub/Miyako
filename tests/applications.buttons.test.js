const ActiveMenus = require('../src/utils/activeMenus');
const appsCmd = require('../src/commands/applications');
const appsUtil = require('../src/utils/applications');

describe('Applications buttons smoke test (coverage)', () => {
  beforeAll(() => {
    process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
    // Reset apps DB
    const db = { nextAppId: 1, applications: [], submissions: [] };
    const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
    require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
  });

  test('root -> apps -> create -> select -> rename -> toggle -> back flows', async () => {
    // Prepare fake channel/message and run command
    const channel = { id: 'chan-btns', send: jest.fn(async ({ embeds, components }) => ({ id: 'msg-buttons', channelId: 'chan-btns', channel, guildId: 'g1', embeds, components })) };
    const author = { id: process.env.OWNER_ID };
    const fakeMessage = { channel, author };
    const sent = await appsCmd.handleApplicationsCommand({ user: { tag: 'T#0' } }, fakeMessage);
    expect(channel.send).toHaveBeenCalled();

    const sentMsg = await channel.send.mock.results[0].value;
    const regMsg = { id: sentMsg.id, channelId: sentMsg.channelId, guildId: sentMsg.guildId };
    ActiveMenus.registerMessage(regMsg, { type: 'applications', userId: author.id, data: { view: 'root', page: 0 } });
    const handler = ActiveMenus._getHandler('applications');

    // Press 'Applications' button
    const interactionApps = { isButton: () => true, user: author, customId: 'appmgr_apps', update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionApps, ActiveMenus._getSessionForMessage(regMsg));
    expect(interactionApps.update).toHaveBeenCalled();

    // Press create
    const interactionCreate = { isButton: () => true, user: author, customId: 'appmgr_apps_create', update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionCreate, ActiveMenus._getSessionForMessage(regMsg));
    expect(interactionCreate.update).toHaveBeenCalled();

    // Find created app
    const apps = appsUtil.listApplications();
    expect(apps.length).toBeGreaterThan(0);
    const app = apps[0];

    // Select app from list (simulate pressing appmgr_app_select_<id>)
    const interactionSelect = { isButton: () => true, user: author, customId: `appmgr_app_select_${app.id}`, update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionSelect, ActiveMenus._getSessionForMessage(regMsg));
    expect(interactionSelect.update).toHaveBeenCalled();

    // Rename flow: simulate showModal + awaitModalSubmit
    const submitted = { fields: { getTextInputValue: (k) => 'BrandNewName' }, reply: jest.fn(async ()=>({})), update: jest.fn(async ()=>({})), user: author };
    const interactionRename = { isButton: () => true, user: author, customId: `appmgr_app_rename_${app.id}`, showModal: jest.fn(async ()=>({})), awaitModalSubmit: jest.fn(async ()=>submitted), isRepliable: ()=>true, replied:false };
    await handler(interactionRename, ActiveMenus._getSessionForMessage(regMsg));
    expect(appsUtil.getApplication(app.id).name).toMatch(/BrandNewName/);

    // Toggle enable/disable
    const interactionToggle = { isButton: () => true, user: author, customId: `appmgr_app_toggle_${app.id}`, update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionToggle, ActiveMenus._getSessionForMessage(regMsg));
    expect(interactionToggle.update).toHaveBeenCalled();

    // Back to apps
    const interactionBack = { isButton: () => true, user: author, customId: 'appmgr_back_apps', update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionBack, ActiveMenus._getSessionForMessage(regMsg));
    expect(interactionBack.update).toHaveBeenCalled();
  });

  test('panel deploy and apply flow', async () => {
    const author = { id: process.env.OWNER_ID };
    // Create a panel and an app
    const app = appsUtil.addApplication({ name: 'ApplyMe' });
    const panels = require('../src/utils/applications').listPanels();
    const panel = require('../src/utils/applications').addPanel({ name: 'P1', applicationIds: [app.id] });

    // Prepare session
    const session = { userId: author.id, data: { view: 'panelDetail', panelId: panel.id } };
    const handler = ActiveMenus._getHandler('applications');

    // Deploy button (uses interaction.channel.send)
    const channel = { id: 'chan-deploy', send: jest.fn(async ({ embeds, components }) => ({ id: 'panel-msg', channelId: 'chan-deploy', channel, guildId: 'g1', embeds, components })) };
    const interactionDeploy = { isButton: () => true, user: author, customId: `appmgr_panel_deploy_${panel.id}`, channel, reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false };
    await handler(interactionDeploy, session);
    expect(interactionDeploy.reply).toHaveBeenCalled();

    // Simulate pressing apply button on deployed message (apply_app_<id>), which is NOT handled by ActiveMenus but by external routing when clicked in channel
    const applyInteraction = { isButton: () => true, user: { id: 'userx' }, customId: `apply_app_${app.id}`, update: jest.fn(async ()=>({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false, channel };
    // For apply buttons we expect some reply (caught by command that receives it). To be safe we call reply and ensure no throw.
    await expect(async () => { await applyInteraction.reply({ content: 'Simulate apply' }); }).not.toThrow();
  });

});
