const ActiveMenus = require('../src/utils/activeMenus');
const appsUtil = require('../src/utils/applications');
const appsCmd = require('../src/commands/applications');

describe('Panel apps add/remove flows', () => {
  beforeAll(() => {
    process.env.OWNER_ID = process.env.OWNER_ID || 'owner';
    // Reset DBs
    const db = { nextAppId: 1, applications: [], submissions: [] };
    const p = require('path').join(require('../src/utils/paths').dataDir(), 'applications.json');
    require('fs').writeFileSync(p, JSON.stringify(db, null, 2));
    const panelsPath = require('path').join(require('../src/utils/paths').dataDir(), 'applicationPanels.json');
    require('fs').writeFileSync(panelsPath, JSON.stringify({ nextPanelId: 1, panels: [] }, null, 2));
  });

  test('add and remove application from panel via modals', async () => {
    const author = { id: process.env.OWNER_ID };
    const app = appsUtil.addApplication({ name: 'PAApp' });
    const panel = require('../src/utils/applications').addPanel({ name: 'PA1' });
    const handler = ActiveMenus._getHandler('applications');

    // Open panel apps view
    await handler({ isButton: () => true, user: author, customId: `appmgr_panel_apps_${panel.id}`, update: jest.fn(async () => ({})), reply: jest.fn(async ()=>({})), isRepliable: ()=>true, replied:false }, { userId: author.id, data: { view: 'panelDetail', panelId: panel.id } });

    // Add app via modal
    const submittedAdd = { fields: { getTextInputValue: (k) => app.id }, reply: jest.fn(async ()=>({})), user: author };
    const interactionAdd = { isButton: () => true, user: author, customId: `panelapps_add_${panel.id}`, showModal: jest.fn(async ()=>({})), awaitModalSubmit: jest.fn(async ()=>submittedAdd), isRepliable: ()=>true, replied:false };
    await handler(interactionAdd, { userId: author.id, data: { view: 'panelApps', panelId: panel.id } });
    const updatedPanel = require('../src/utils/applications').getPanel(panel.id);
    expect(updatedPanel.applicationIds.includes(app.id)).toBe(true);

    // Remove via modal
    const submittedRem = { fields: { getTextInputValue: (k) => app.id }, reply: jest.fn(async ()=>({})), user: author };
    const interactionRem = { isButton: () => true, user: author, customId: `panelapps_remove_${panel.id}`, showModal: jest.fn(async ()=>({})), awaitModalSubmit: jest.fn(async ()=>submittedRem), isRepliable: ()=>true, replied:false };
    await handler(interactionRem, { userId: author.id, data: { view: 'panelApps', panelId: panel.id } });
    const updatedPanel2 = require('../src/utils/applications').getPanel(panel.id);
    expect(updatedPanel2.applicationIds.includes(app.id)).toBe(false);
  });
});
