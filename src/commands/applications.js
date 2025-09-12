// Staff Applications System - Root Command & ActiveMenus handler (Phase 1)
// Provides interactive management UI for Applications and Panels. Submission flow & manager actions added in later phases.

const ActiveMenus = require('../utils/activeMenus');
const theme = require('../utils/theme');
const { createEmbed, safeAddField } = require('../utils/embeds');
const { semanticButton, buildNavRow, backButton, splitButtonsIntoRows } = require('../ui');
const {
  listApplications,
  addApplication,
  updateApplication,
  removeApplication,
  listPanels,
  addPanel,
  updatePanel,
  removePanel,
  getApplication,
  getPanel
} = require('../utils/applications');

// --- Helpers -----------------------------------------------------------------

function buildRootEmbed() {
  const apps = listApplications();
  const panels = listPanels();
  const e = createEmbed({
    title: `${theme.emojis.settings || '⚙️'} Applications Manager`,
    description: 'Create and configure Applications and Panels. More actions coming soon.'
  });
  safeAddField(e, 'Applications', apps.length ? apps.slice(0, 10).map(a => `${a.enabled ? '🟢' : '🔴'} #${a.id} **${a.name}** (${a.questions.length} q)`).join('\n') : '*(none)*');
  safeAddField(e, 'Panels', panels.length ? panels.slice(0, 10).map(p => `#${p.id} **${p.name}** (${p.applicationIds.length} apps)`).join('\n') : '*(none)*');
  return e;
}

function buildRootComponents() {
  // Removed 'New App' and 'New Panel' from root per request. Change Applications emoji to 📝.
  const row1 = buildNavRow([
    semanticButton('primary', { id: 'appmgr_apps', label: 'Applications', emoji: '📝' }),
    semanticButton('primary', { id: 'appmgr_panels', label: 'Panels', emoji: theme.emojis.settings }),
  ]);
  return [row1];
}

function buildApplicationsListEmbed(page = 0, pageSize = 5) {
  const apps = listApplications();
  const totalPages = Math.max(1, Math.ceil(apps.length / pageSize));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const slice = apps.slice(page * pageSize, page * pageSize + pageSize);
  const e = createEmbed({ title: 'Applications', description: `Page ${page + 1}/${totalPages} • ${apps.length} total` });
  if (!apps.length) {
    safeAddField(e, 'Empty', 'No applications found. Use Create to make a new one.');
    return { embed: e, page, totalPages, apps: [] };
  }
  for (const a of slice) {
    safeAddField(e, `#${a.id} ${a.enabled ? '🟢' : '🔴'} ${a.name}`, `${a.questions.length} question(s)`);
  }
  return { embed: e, page, totalPages, apps: slice };
}

function buildApplicationsListComponents(page, totalPages, apps) {
  // apps may be omitted; compute slice if necessary
  const allApps = Array.isArray(apps) ? apps : listApplications().slice(page * 5, page * 5 + 5);
  const prev = semanticButton('nav', { id: 'appmgr_apps_prev', label: 'Prev', enabled: page > 0 });
  const next = semanticButton('nav', { id: 'appmgr_apps_next', label: 'Next', enabled: page < totalPages - 1 });
  const createBtn = semanticButton('success', { id: 'appmgr_apps_create', label: 'Create', emoji: theme.emojis.create });
  const deleteBtn = semanticButton('danger', { id: 'appmgr_apps_delete', label: 'Delete', emoji: theme.emojis.delete });
  const back = backButton('appmgr_back_root', 'Back');
  const appButtons = allApps.map(a => semanticButton('primary', { id: `appmgr_app_select_${a.id}`, label: a.name.slice(0, 20) }));
  // Build selection rows (max 5 per row). If none, show clear disabled button.
  const selectionRows = appButtons.length ? splitButtonsIntoRows(appButtons) : [ buildNavRow([semanticButton('secondary', { id: 'noop', label: 'No applications', enabled: false })]) ];
  // Bottom-most row: navigation + create/delete + back
  const bottomItems = [];
  if ((totalPages || 1) > 1 && page > 0) bottomItems.push(prev);
  if ((totalPages || 1) > 1 && page < (totalPages - 1)) bottomItems.push(next);
  bottomItems.push(createBtn, deleteBtn, back);
  return [...selectionRows, ...splitButtonsIntoRows(bottomItems)];
}

function buildPanelsListEmbed(page = 0, pageSize = 5) {
  const panels = listPanels();
  const totalPages = Math.max(1, Math.ceil(panels.length / pageSize));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const slice = panels.slice(page * pageSize, page * pageSize + pageSize);
  const e = createEmbed({ title: 'Panels', description: `Page ${page + 1}/${totalPages} • ${panels.length} total` });
  if (!panels.length) safeAddField(e, 'Empty', 'No panels found. Use Create to make a new one.');
  for (const p of slice) {
    safeAddField(e, `#${p.id} ${p.name}`, `${p.applicationIds.length} application(s)`);
  }
  return { embed: e, page, totalPages, panels: slice };
}

function buildPanelsListComponents(page, totalPages, panels) {
  const allPanels = Array.isArray(panels) ? panels : listPanels().slice(page * 5, page * 5 + 5);
  const prev = semanticButton('nav', { id: 'appmgr_panels_prev', label: 'Prev', enabled: page > 0 });
  const next = semanticButton('nav', { id: 'appmgr_panels_next', label: 'Next', enabled: page < totalPages - 1 });
  const createBtn = semanticButton('success', { id: 'appmgr_panels_create', label: 'Create', emoji: theme.emojis.create });
  const deleteBtn = semanticButton('danger', { id: 'appmgr_panels_delete', label: 'Delete', emoji: theme.emojis.delete });
  const back = backButton('appmgr_back_root', 'Back');
  const panelButtons = allPanels.map(p => semanticButton('primary', { id: `appmgr_panel_select_${p.id}`, label: p.name.slice(0, 20) }));
  const selectionRows = panelButtons.length ? splitButtonsIntoRows(panelButtons) : [ buildNavRow([semanticButton('secondary', { id: 'noop', label: 'No panels', enabled: false })]) ];
  const bottomItems = [];
  if ((totalPages || 1) > 1 && page > 0) bottomItems.push(prev);
  if ((totalPages || 1) > 1 && page < (totalPages - 1)) bottomItems.push(next);
  bottomItems.push(createBtn, deleteBtn, back);
  return [...selectionRows, ...splitButtonsIntoRows(bottomItems)];
}

function buildAppDetailEmbed(appId) {
  const app = getApplication(appId);
  if (!app) return createEmbed({ title: 'Missing Application', description: 'It may have been removed.' });
  const e = createEmbed({ title: `Application #${app.id}`, description: app.name });
  safeAddField(e, 'Status', app.enabled ? '🟢 Enabled' : '🔴 Disabled', true);
  safeAddField(e, 'Questions', String(app.questions.length), true);
  safeAddField(e, 'Submission Channel', app.submissionChannelId ? `<#${app.submissionChannelId}>` : '*none*');
  if (app.requiredRoles?.length) safeAddField(e, 'Required Roles', app.requiredRoles.map(r => `<@&${r}>`).join(' '));
  if (app.managerRoles?.length) safeAddField(e, 'Manager Roles', app.managerRoles.map(r => `<@&${r}>`).join(' '));
  if (app.acceptedRoles?.length) safeAddField(e, 'Accepted Roles', app.acceptedRoles.map(r => `<@&${r}>`).join(' '));
  if (app.pendingRole) safeAddField(e, 'Pending Role', `<@&${app.pendingRole}>`, true);
  if (app.restrictedRoles?.length) safeAddField(e, 'Restricted Roles', app.restrictedRoles.map(r=>`<@&${r}>`).join(' '));
  if (app.deniedRoles?.length) safeAddField(e, 'Denied Roles', app.deniedRoles.map(r=>`<@&${r}>`).join(' '));
  return e;
}

function buildAppDetailComponents(appId) {
  const app = getApplication(appId);
  const back = backButton('appmgr_back_apps', 'Back');
  if (!app) return [buildNavRow([back])];
  const toggle = semanticButton('toggle', { id: `appmgr_app_toggle_${app.id}`, label: app.enabled ? 'Disable' : 'Enable', active: app.enabled });
  const rename = semanticButton('primary', { id: `appmgr_app_rename_${app.id}`, label: 'Rename', emoji: theme.emojis.edit });
  const del = semanticButton('danger', { id: `appmgr_app_delete_${app.id}`, label: 'Delete', emoji: theme.emojis.delete });
  const qBtn = semanticButton('primary', { id: `appmgr_app_questions_${app.id}`, label: 'Questions' });
  const msgBtn = semanticButton('primary', { id: `appmgr_app_msgs_${app.id}`, label: 'Messages' });
  const propsBtn = semanticButton('primary', { id: `appmgr_app_props_${app.id}`, label: 'Props' });
  const rolesBtn = semanticButton('primary', { id: `appmgr_app_roles_${app.id}`, label: 'Roles' });
  const rows1 = splitButtonsIntoRows([toggle, qBtn, msgBtn, propsBtn, rolesBtn, back]);
  const row2 = buildNavRow([rename, del]);
  return [...rows1, row2].filter(r=>r && r.components && r.components.length);
}

function buildQuestionListEmbed(appId, page=0) {
  const app = getApplication(appId);
  if (!app) return createEmbed({ title: 'Questions', description: 'App missing.' });
  const perPage = 6;
  const totalPages = Math.max(1, Math.ceil(app.questions.length / perPage));
  page = Math.min(Math.max(0, page), totalPages -1);
  const slice = app.questions.slice(page*perPage, page*perPage+perPage);
  const e = createEmbed({ title: `Questions • App #${app.id}`, description: `Page ${page+1}/${totalPages}` });
  if (!slice.length) safeAddField(e, 'Empty', 'No questions yet.');
  slice.forEach((q,i) => {
    safeAddField(e, `${page*perPage + i +1}. ${q.label.slice(0,230)} ${q.required?'(required)':''}`, `ID: ${q.id} • Type: ${q.type}`);
  });
  return { embed:e, page, totalPages };
}

function buildQuestionListComponents(appId, page, totalPages) {
  const navButtons = [
    semanticButton('nav', { id: `appq_prev_${appId}`, label: 'Prev', enabled: page>0 }),
    semanticButton('nav', { id: `appq_next_${appId}`, label: 'Next', enabled: page < totalPages-1 }),
    semanticButton('success', { id: `appq_add_${appId}`, label: 'Add' }),
    semanticButton('primary', { id: `appq_edit_${appId}`, label: 'Edit' }),
    semanticButton('danger', { id: `appq_del_${appId}`, label: 'Delete' }),
    backButton(`appq_back_${appId}`, 'Back')
  ];
  const navRows = splitButtonsIntoRows(navButtons);
  const nav2 = buildNavRow([ semanticButton('primary', { id: `appq_reorder_${appId}`, label: 'Reorder' }) ]);
  return [...navRows, nav2];
}

function buildPanelDetailEmbed(panelId) {
  const panel = getPanel(panelId);
  if (!panel) return createEmbed({ title: 'Missing Panel', description: 'It may have been removed.' });
  const e = createEmbed({ title: `Panel #${panel.id}`, description: panel.name });
  safeAddField(e, 'Applications', panel.applicationIds.length ? panel.applicationIds.map(id => `#${id}`).join(', ') : '*none*');
  safeAddField(e, 'Channel', panel.channelId ? `<#${panel.channelId}>` : '*none set*');
  if (panel.description) safeAddField(e, 'Description', panel.description.slice(0, 256));
  return e;
}

function buildPanelDetailComponents(panelId) {
  const panel = getPanel(panelId);
  const back = backButton('appmgr_back_panels', 'Back');
  if (!panel) return [buildNavRow([back])];
  const rename = semanticButton('primary', { id: `appmgr_panel_rename_${panel.id}`, label: 'Rename', emoji: theme.emojis.edit });
  const desc = semanticButton('primary', { id: `appmgr_panel_desc_${panel.id}`, label: 'Desc' });
  const chan = semanticButton('primary', { id: `appmgr_panel_channel_${panel.id}`, label: 'Channel' });
  const appsManage = semanticButton('primary', { id: `appmgr_panel_apps_${panel.id}`, label: 'Apps' });
  const deploy = semanticButton('success', { id: `appmgr_panel_deploy_${panel.id}`, label: 'Deploy' });
  const del = semanticButton('danger', { id: `appmgr_panel_delete_${panel.id}`, label: 'Delete', emoji: theme.emojis.delete });
  const rows1 = splitButtonsIntoRows([rename, desc, chan, appsManage, deploy, back]);
  const row2 = buildNavRow([del]);
  return [...rows1, row2];
}

// --- Public Command Entry ----------------------------------------------------

async function handleApplicationsCommand(client, message) {
  // Owner-gated for Phase 1; will expand with role-based gating later.
  if (message.author.id !== process.env.OWNER_ID) {
    return message.reply({ content: 'This command is currently restricted.', allowedMentions: { repliedUser: false } });
  }
  const embed = buildRootEmbed();
  const comps = buildRootComponents();
  let sent;
  try {
    sent = await message.channel.send({ embeds: [embed], components: comps });
  } catch (e) {
    try { require('../utils/logger').error('[applications] send failed', { err: e.message }); } catch {}
    return message.reply({ content: 'Failed to open Applications Manager (logged).', allowedMentions: { repliedUser: false } });
  }
  ActiveMenus.registerMessage(sent, { type: 'applications', userId: message.author.id, data: { view: 'root', page: 0 } });
  return sent;
}

// --- Interaction Handler -----------------------------------------------------

ActiveMenus.registerHandler('applications', async (interaction, session) => {
  if (!interaction.isButton()) return;
  if (interaction.user.id !== session.userId) {
    return interaction.reply({ content: 'Not your session.', flags: 1 << 6 }).catch(() => {});
  }
  const id = interaction.customId;
  try {
    // Close button removed (was appmgr_close) – users navigate back instead.
    // Root navigation
    if (id === 'appmgr_back_root') {
      session.data.view = 'root'; session.data.page = 0; session.data.appId = null; session.data.panelId = null;
      return interaction.update({ embeds: [buildRootEmbed()], components: buildRootComponents() });
    }
    if (id === 'appmgr_apps') {
      session.data.view = 'apps'; session.data.page = 0;
      const { embed, page, totalPages, apps } = buildApplicationsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages, apps) });
    }
    if (id === 'appmgr_panels') {
      session.data.view = 'panels'; session.data.page = 0;
      const { embed, page, totalPages, panels } = buildPanelsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages, panels) });
    }
    if (id === 'appmgr_new_app') {
      const created = addApplication({});
      session.data.view = 'appDetail'; session.data.appId = created.id;
      return interaction.update({ embeds: [buildAppDetailEmbed(created.id)], components: buildAppDetailComponents(created.id) });
    }
    // Create from list
    if (id === 'appmgr_apps_create') {
      const created = addApplication({});
      session.data.view = 'appDetail'; session.data.appId = created.id;
      try {
        return interaction.update({ embeds: [buildAppDetailEmbed(created.id)], components: buildAppDetailComponents(created.id) });
      } catch (e) {
        try { require('../utils/logger').error('[applications] create app failed', { err: e.message, stack: e.stack }); } catch {}
        return interaction.reply({ content: 'Failed to create application.', flags: 1<<6 }).catch(()=>{});
      }
    }
    if (id === 'appmgr_new_panel') {
      const created = addPanel({});
      session.data.view = 'panelDetail'; session.data.panelId = created.id;
      return interaction.update({ embeds: [buildPanelDetailEmbed(created.id)], components: buildPanelDetailComponents(created.id) });
    }
    if (id === 'appmgr_panels_create') {
      const created = addPanel({});
      session.data.view = 'panelDetail'; session.data.panelId = created.id;
      try {
        return interaction.update({ embeds: [buildPanelDetailEmbed(created.id)], components: buildPanelDetailComponents(created.id) });
      } catch (e) {
        try { require('../utils/logger').error('[applications] create panel failed', { err: e.message, stack: e.stack }); } catch {}
        return interaction.reply({ content: 'Failed to create panel.', flags: 1<<6 }).catch(()=>{});
      }
    }
    // Pagination (apps)
    if (id === 'appmgr_apps_prev' || id === 'appmgr_apps_next') {
      if (session.data.view !== 'apps') return;
      const delta = id.endsWith('next') ? 1 : -1;
      const { page: curPage } = session.data;
      const apps = listApplications();
      const pageSize = 5; const totalPages = Math.max(1, Math.ceil(apps.length / pageSize));
      let newPage = Math.min(Math.max(0, curPage + delta), totalPages - 1);
      session.data.page = newPage;
      const { embed, page, totalPages: tp, apps: pageApps } = buildApplicationsListEmbed(newPage);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, tp, pageApps) });
    }
    // Pagination (panels)
    if (id === 'appmgr_panels_prev' || id === 'appmgr_panels_next') {
      if (session.data.view !== 'panels') return;
      const delta = id.endsWith('next') ? 1 : -1;
      const { page: curPage } = session.data;
      const panels = listPanels();
      const pageSize = 5; const totalPages = Math.max(1, Math.ceil(panels.length / pageSize));
      let newPage = Math.min(Math.max(0, curPage + delta), totalPages - 1);
      session.data.page = newPage;
      const { embed, page, totalPages: tp, panels: pagePanels } = buildPanelsListEmbed(newPage);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, tp, pagePanels) });
    }
    // Select application from list to edit/delete
    if (id.startsWith('appmgr_app_select_')) {
      const appId = id.split('_').pop();
      // guard: ensure exists
      const app = getApplication(appId);
      if (!app) {
        try { require('../utils/logger').warn('[applications] selected missing app', { appId }); } catch {}
        session.data.view = 'apps'; session.data.appId = null;
        const { embed, page, totalPages, apps } = buildApplicationsListEmbed(session.data.page || 0);
        return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages, apps) });
      }
      session.data.view = 'appDetail'; session.data.appId = appId;
      return interaction.update({ embeds: [buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
    }
    // Select panel from list to edit/delete
    if (id.startsWith('appmgr_panel_select_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId);
      if (!panel) {
        try { require('../utils/logger').warn('[applications] selected missing panel', { panelId }); } catch {}
        session.data.view = 'panels'; session.data.panelId = null;
        const { embed, page, totalPages, panels } = buildPanelsListEmbed(session.data.page || 0);
        return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages, panels) });
      }
      session.data.view = 'panelDetail'; session.data.panelId = panelId;
      return interaction.update({ embeds: [buildPanelDetailEmbed(panelId)], components: buildPanelDetailComponents(panelId) });
    }
    // App detail buttons dynamic patterns
    if (id.startsWith('appmgr_app_toggle_')) {
      const appId = id.split('_').pop();
      const app = getApplication(appId);
      if (app) {
        updateApplication(app.id, { enabled: !app.enabled });
        try {
          return interaction.update({ embeds: [buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
        } catch (e) {
          try { require('../utils/logger').error('[applications] toggle failed', { err: e.message, stack: e.stack }); } catch {}
        }
      }
      return interaction.reply({ content: 'Application not found.', flags: 1<<6 }).catch(()=>{});
    }
    if (id === 'appmgr_apps_delete') {
      // Delete currently selected app from list context
      const appId = session.data.appId || null;
      if (!appId) return interaction.reply({ content: 'No application selected to delete.', flags: 1<<6 }).catch(()=>{});
      if (!getApplication(appId)) return interaction.reply({ content: 'Application not found.', flags: 1<<6 }).catch(()=>{});
      // fall through to existing deletion flow by setting id to specific
    }
    if (id.startsWith('appmgr_app_delete_') || id === 'appmgr_apps_delete') {
      const appId = id.split('_').pop();
      const app = getApplication(appId);
      if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `appdel_${appId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle('Delete Application')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirm').setLabel('Type DELETE to confirm').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(m);
      const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!submitted) return;
      const val = submitted.fields.getTextInputValue('confirm').trim();
      if (val !== 'DELETE') return submitted.reply({ content:'Cancelled. Type DELETE to confirm.', flags:1<<6 }).catch(()=>{});
      removeApplication(appId);
      session.data.view = 'apps'; session.data.appId = null;
      const { embed, page, totalPages, apps } = buildApplicationsListEmbed(session.data.page || 0);
      try {
        return submitted.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages, apps), content: 'Application deleted.' });
      } catch (e) {
        try { require('../utils/logger').error('[applications] update after delete failed', { err: e.message, stack: e.stack }); } catch {}
        return submitted.reply({ content: 'Application deleted.', flags: 1<<6 }).catch(()=>{});
      }
    }
    if (id.startsWith('appmgr_app_rename_')) {
      const appId = id.split('_').pop();
      const app = getApplication(appId);
      if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `appname_${appId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle('Rename Application')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(app.name.slice(0,90))));
      await interaction.showModal(m);
      const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!submitted) return;
      const val = submitted.fields.getTextInputValue('name').trim().slice(0,100) || 'App';
      updateApplication(app.id, { name: val });
      return submitted.update({ embeds: [buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId), content: 'Renamed.' });
    }
    if (id.startsWith('appmgr_app_props_')) {
      const appId = id.split('_').pop();
      session.data.view = 'appProps'; session.data.appId = appId;
      const app = getApplication(appId);
      if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const e = createEmbed({ title:`Properties • App #${appId}`, description: app.name });
      safeAddField(e, 'Name', app.name);
      safeAddField(e, 'Submission Channel', app.submissionChannelId?`<#${app.submissionChannelId}>`:'*none*');
      safeAddField(e, 'DM Responses', app.dmResponses ? 'Enabled' : 'Disabled');
      const row = buildNavRow([
        semanticButton('primary', { id:`appprops_setname_${appId}`, label:'Name' }),
        semanticButton('primary', { id:`appprops_setchan_${appId}`, label:'SetChan' }),
        semanticButton('danger', { id:`appprops_clearchan_${appId}`, label:'ClrChan', enabled: !!app.submissionChannelId }),
        semanticButton('primary', { id:`appprops_toggledm_${appId}`, label:'DMs' }),
  backButton(`appprops_back_${appId}`, 'Back')
      ]);
      return interaction.update({ embeds:[e], components:[row] });
    }
    if (session.data.view === 'appProps' && /^appprops_/.test(id)) {
      const parts = id.split('_');
      const action = parts[1];
      const appId = parts[2];
      const app = getApplication(appId); if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      if (action === 'back') {
        session.data.view = 'appDetail';
        return interaction.update({ embeds:[buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
      }
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      if (action === 'setname') {
        const modalId = `apppropname_${appId}_${Date.now()}`;
        const m = new ModalBuilder().setCustomId(modalId).setTitle('Set Name').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(app.name.slice(0,90))));
        await interaction.showModal(m);
        const sub = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
        if (!sub) return;
        const val = sub.fields.getTextInputValue('name').trim().slice(0,100)||'App';
        updateApplication(app.id, { name: val });
        return sub.reply({ content:'Updated name.', flags:1<<6 }).catch(()=>{});
      }
      if (action === 'setchan') {
        updateApplication(app.id, { submissionChannelId: interaction.channelId });
        return interaction.reply({ content:'Submission channel set to this channel.', flags:1<<6 }).catch(()=>{});
      }
      if (action === 'clearchan') {
        updateApplication(app.id, { submissionChannelId: null });
        return interaction.reply({ content:'Submission channel cleared.', flags:1<<6 }).catch(()=>{});
      }
      if (action === 'toggledm') {
        updateApplication(app.id, { dmResponses: !app.dmResponses });
        return interaction.reply({ content:`DM responses now ${!app.dmResponses ? 'enabled':'disabled'}.`, flags:1<<6 }).catch(()=>{});
      }
    }
    if (id.startsWith('appmgr_app_roles_')) {
      const appId = id.split('_').pop();
      session.data.view = 'appRoles'; session.data.appId = appId;
      const app = getApplication(appId); if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const e = createEmbed({ title:`Roles • App #${appId}`, description: app.name });
      const show = (arr) => (arr && arr.length) ? arr.map(r=>`<@&${r}>`).join(' ') : '*none*';
      safeAddField(e, 'Manager', show(app.managerRoles));
      safeAddField(e, 'Required', show(app.requiredRoles));
      safeAddField(e, 'Accepted', show(app.acceptedRoles));
      safeAddField(e, 'Pending', app.pendingRole?`<@&${app.pendingRole}>`:'*none*');
      safeAddField(e, 'Restricted', show(app.restrictedRoles));
      safeAddField(e, 'Denied', show(app.deniedRoles));
      const row1 = buildNavRow([
        semanticButton('primary', { id:`approles_manager_${appId}`, label:'Manager' }),
        semanticButton('primary', { id:`approles_required_${appId}`, label:'Required' }),
        semanticButton('primary', { id:`approles_accepted_${appId}`, label:'Accepted' }),
        semanticButton('primary', { id:`approles_pending_${appId}`, label:'Pending' }),
  backButton(`approles_back_${appId}`, 'Back')
      ]);
      const row2 = buildNavRow([
        semanticButton('primary', { id:`approles_restricted_${appId}`, label:'Restrict' }),
        semanticButton('primary', { id:`approles_denied_${appId}`, label:'Denied' })
      ]);
      return interaction.update({ embeds:[e], components:[row1, row2] });
    }
    if (session.data.view === 'appRoles' && /^approles_/.test(id)) {
      const parts = id.split('_'); // approles,field,appId
      const field = parts[1];
      const appId = parts[2];
      if (field === 'back') {
        session.data.view = 'appDetail';
        return interaction.update({ embeds:[buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
      }
      const map = {
        manager: 'managerRoles',
        required: 'requiredRoles',
        accepted: 'acceptedRoles',
        pending: 'pendingRole',
        restricted: 'restrictedRoles',
        denied: 'deniedRoles'
      };
      const key = map[field];
      const app = getApplication(appId); if (!app || !key) return interaction.reply({ content:'Invalid.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `approles_${field}_${appId}_${Date.now()}`;
      const existing = Array.isArray(app[key]) ? app[key].join(' ') : (app[key]||'');
      const label = field === 'pending' ? 'Single role ID or mention (or none to clear)' : 'Role IDs / mentions (space/comma separated)';
      const m = new ModalBuilder().setCustomId(modalId).setTitle(`Edit ${field}`)
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roles').setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(existing.slice(0,400))))
      ;
      await interaction.showModal(m);
      const submitted = await interaction.awaitModalSubmit({ time:120000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!submitted) return;
      const raw = (submitted.fields.getTextInputValue('roles')||'').trim();
      const parseRoles = (txt) => txt.split(/[\s,]+/).map(t=>t.trim()).filter(Boolean).map(t=>t.replace(/[^0-9]/g,'')).filter(Boolean);
      if (field === 'pending') {
        const first = parseRoles(raw)[0] || null;
        updateApplication(app.id, { pendingRole: first });
      } else {
        const roles = parseRoles(raw);
        updateApplication(app.id, { [key]: roles });
      }
      return submitted.reply({ content:'Updated roles.', flags:1<<6 }).catch(()=>{});
    }
    if (id.startsWith('appmgr_app_msgs_')) {
      const appId = id.split('_').pop();
      session.data.view = 'appMsgs'; session.data.appId = appId;
      const app = getApplication(appId);
      const e = createEmbed({ title:`Messages • App #${appId}`, description:'Edit the various lifecycle messages.' });
      safeAddField(e, 'Accept', app.acceptMessage || '(none)');
      safeAddField(e, 'Deny', app.denyMessage || '(none)');
      safeAddField(e, 'Confirm', app.confirmMessage || '(none)');
      safeAddField(e, 'Completion', app.completionMessage || '(none)');
      const row = buildNavRow([
        semanticButton('primary', { id:`appmsg_edit_accept_${appId}`, label:'Accept' }),
        semanticButton('primary', { id:`appmsg_edit_deny_${appId}`, label:'Deny' }),
        semanticButton('primary', { id:`appmsg_edit_confirm_${appId}`, label:'Confirm' }),
        semanticButton('primary', { id:`appmsg_edit_completion_${appId}`, label:'Completion' }),
  backButton(`appmsg_back_${appId}`, 'Back')
      ]);
      return interaction.update({ embeds:[e], components:[row] });
    }
    if (session.data.view === 'appMsgs' && /^appmsg_(edit|back)_/.test(id)) {
      const parts = id.split('_'); // appmsg,action,field,appId
      const action = parts[1];
      const field = parts[2];
      const appId = parts[3];
      if (action === 'back') {
        session.data.view = 'appDetail';
        return interaction.update({ embeds:[buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
      }
      const validFields = { accept:'acceptMessage', deny:'denyMessage', confirm:'confirmMessage', completion:'completionMessage' };
      const key = validFields[field];
      if (!key) return interaction.reply({ content:'Unknown field.', flags:1<<6 }).catch(()=>{});
      const app = getApplication(appId);
      if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `appmsg_${field}_${appId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle(`Edit ${field}`)
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('content').setLabel('Content').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((app[key]||'').slice(0,4000))));
      await interaction.showModal(m);
      const submitted = await interaction.awaitModalSubmit({ time:120000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!submitted) return;
      const val = submitted.fields.getTextInputValue('content').slice(0,4000);
      updateApplication(app.id, { [key]: val });
      return submitted.reply({ content:'Updated message.', flags:1<<6 }).catch(()=>{});
    }
    if (id.startsWith('appmgr_app_questions_')) {
      const appId = id.split('_').pop();
      session.data.view = 'questions'; session.data.qPage = 0; session.data.appId = appId;
      const { embed, page, totalPages } = buildQuestionListEmbed(appId, 0);
      return interaction.update({ embeds:[embed], components: buildQuestionListComponents(appId, page, totalPages) });
    }
    if (id === 'appmgr_back_apps') {
      session.data.view = 'apps'; session.data.appId = null;
      const { embed, page, totalPages } = buildApplicationsListEmbed(session.data.page || 0);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages) });
    }
    // Question list navigation / actions
    if (session.data.view === 'questions' && /^appq_(prev|next|add|edit|del|reorder|back)_/.test(id)) {
      const [, action, appId] = id.split('_');
      const app = getApplication(appId);
      if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
      const page = session.data.qPage || 0;
      if (action === 'prev' || action === 'next') {
        const perPage = 6; const totalPages = Math.max(1, Math.ceil(app.questions.length / perPage));
        let newPage = page + (action==='next'?1:-1); newPage = Math.min(Math.max(0,newPage), totalPages-1);
        session.data.qPage = newPage;
        const { embed, page:p, totalPages:tp } = buildQuestionListEmbed(appId, newPage);
        return interaction.update({ embeds:[embed], components: buildQuestionListComponents(appId, p, tp) });
      }
      if (action === 'back') {
        session.data.view = 'appDetail';
        return interaction.update({ embeds:[buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
      }
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      if (action === 'add') {
        const modalId = `qadd_${appId}_${Date.now()}`;
        const m = new ModalBuilder().setCustomId(modalId).setTitle('Add Question')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setRequired(true)))
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type (short|long)').setStyle(TextInputStyle.Short).setRequired(true).setValue('short')))
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('required').setLabel('Required? (y/n)').setStyle(TextInputStyle.Short).setRequired(true).setValue('y')));
        await interaction.showModal(m);
        const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
        if (!submitted) return;
        const label = submitted.fields.getTextInputValue('label').trim();
        const type = /long/i.test(submitted.fields.getTextInputValue('type')) ? 'long':'short';
        const required = /^y(es)?$/i.test(submitted.fields.getTextInputValue('required'));
        const qid = `q${Date.now().toString(36)}`;
        updateApplication(app.id, { questions: [...app.questions, { id: qid, type, label, required }] });
  buildQuestionListEmbed(appId, session.data.qPage||0);
        return submitted.reply({ content:'Added question.', flags:1<<6 }).catch(()=>{});
      }
      if (action === 'del') {
        if (!app.questions.length) return interaction.reply({ content:'No questions.', flags:1<<6 }).catch(()=>{});
        updateApplication(app.id, { questions: app.questions.slice(0,-1) });
        const { embed, page:p, totalPages:tp } = buildQuestionListEmbed(appId, Math.min(session.data.qPage||0, Math.max(0, Math.ceil((app.questions.length-1)/6)-1)) );
        return interaction.update({ embeds:[embed], components: buildQuestionListComponents(appId, p, tp) });
      }
      if (action === 'edit') {
        if (!app.questions.length) return interaction.reply({ content:'No questions.', flags:1<<6 }).catch(()=>{});
        const target = app.questions[app.questions.length-1]; // edit last for simplicity
        const modalId = `qedit_${appId}_${target.id}_${Date.now()}`;
        const m = new ModalBuilder().setCustomId(modalId).setTitle('Edit Last Question')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short).setRequired(true).setValue(target.label.slice(0,100))))
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type (short|long)').setStyle(TextInputStyle.Short).setRequired(true).setValue(target.type)))
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('required').setLabel('Required? (y/n)').setStyle(TextInputStyle.Short).setRequired(true).setValue(target.required?'y':'n')));
        await interaction.showModal(m);
        const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
        if (!submitted) return;
        const label = submitted.fields.getTextInputValue('label').trim();
        const type = /long/i.test(submitted.fields.getTextInputValue('type')) ? 'long':'short';
        const required = /^y(es)?$/i.test(submitted.fields.getTextInputValue('required'));
        const newQs = app.questions.map(q => q.id===target.id ? { ...q, label, type, required } : q);
        updateApplication(app.id, { questions: newQs });
        return submitted.reply({ content:'Updated question.', flags:1<<6 }).catch(()=>{});
      }
      if (action === 'reorder') {
        if (app.questions.length < 2) return interaction.reply({ content:'Need at least 2 questions.', flags:1<<6 }).catch(()=>{});
        // Simple rotate: move last to first as placeholder reorder method.
        const copy = [...app.questions];
        copy.unshift(copy.pop());
        updateApplication(app.id, { questions: copy });
        const { embed, page:p, totalPages:tp } = buildQuestionListEmbed(appId, session.data.qPage||0);
        return interaction.update({ embeds:[embed], components: buildQuestionListComponents(appId, p, tp) });
      }
    }
    // Panel detail operations
    if (id === 'appmgr_panels_delete') {
      const panelId = session.data.panelId || null;
      if (!panelId) return interaction.reply({ content: 'No panel selected to delete.', flags: 1<<6 }).catch(()=>{});
      if (!getPanel(panelId)) return interaction.reply({ content: 'Panel not found.', flags: 1<<6 }).catch(()=>{});
      // continue to deletion below by normalizing id
    }
    if (id.startsWith('appmgr_panel_delete_') || id === 'appmgr_panels_delete') {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId);
      if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `paneldel_${panelId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle('Delete Panel')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('confirm').setLabel('Type DELETE to confirm').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(m);
      const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!submitted) return;
      const val = submitted.fields.getTextInputValue('confirm').trim();
      if (val !== 'DELETE') return submitted.reply({ content:'Cancelled. Type DELETE to confirm.', flags:1<<6 }).catch(()=>{});
      removePanel(panelId);
      session.data.view = 'panels'; session.data.panelId = null;
      const { embed, page, totalPages, panels } = buildPanelsListEmbed(session.data.page || 0);
      try {
        return submitted.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages, panels), content: 'Panel deleted.' });
      } catch (e) {
        try { require('../utils/logger').error('[applications] update after panel delete failed', { err: e.message, stack: e.stack }); } catch {}
        return submitted.reply({ content: 'Panel deleted.', flags: 1<<6 }).catch(()=>{});
      }
    }
    if (id.startsWith('appmgr_panel_rename_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId);
      if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `panelname_${panelId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle('Rename Panel')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(panel.name.slice(0,90))));
      await interaction.showModal(m);
      const sub = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!sub) return;
      const val = sub.fields.getTextInputValue('name').trim().slice(0,100)||'Panel';
      updatePanel(panel.id, { name: val });
      return sub.reply({ content:'Renamed.', flags:1<<6 }).catch(()=>{});
    }
    if (id.startsWith('appmgr_panel_desc_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId); if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      const modalId = `paneldesc_${panelId}_${Date.now()}`;
      const m = new ModalBuilder().setCustomId(modalId).setTitle('Panel Description')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue((panel.description||'').slice(0,400))));
      await interaction.showModal(m);
      const sub = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
      if (!sub) return;
      const val = (sub.fields.getTextInputValue('desc')||'').slice(0,1000);
      updatePanel(panel.id, { description: val });
      return sub.reply({ content:'Updated description.', flags:1<<6 }).catch(()=>{});
    }
    if (id.startsWith('appmgr_panel_channel_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId); if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      updatePanel(panel.id, { channelId: interaction.channelId });
      return interaction.reply({ content:'Panel channel set to this channel.', flags:1<<6 }).catch(()=>{});
    }
    if (id.startsWith('appmgr_panel_apps_')) {
      const panelId = id.split('_').pop();
      session.data.view = 'panelApps'; session.data.panelId = panelId;
      const panel = getPanel(panelId); if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      const e = createEmbed({ title:`Panel Apps • #${panel.id}`, description: panel.name });
      const rows = panel.applicationIds.map(id=>`#${id}`).join(', ') || '*none*';
      safeAddField(e, 'Application IDs', rows);
      const row = buildNavRow([
        semanticButton('primary', { id:`panelapps_add_${panelId}`, label:'AddApp' }),
        semanticButton('danger', { id:`panelapps_remove_${panelId}`, label:'RemApp' }),
  backButton(`panelapps_back_${panelId}`, 'Back')
      ]);
      return interaction.update({ embeds:[e], components:[row] });
    }
    if (session.data.view === 'panelApps' && /^panelapps_/.test(id)) {
      const parts = id.split('_'); // panelapps,action,panelId
      const action = parts[1];
      const panelId = parts[2];
      const panel = getPanel(panelId); if (!panel) return interaction.reply({ content:'Panel missing.', flags:1<<6 }).catch(()=>{});
      if (action === 'back') {
        session.data.view = 'panelDetail';
        return interaction.update({ embeds:[buildPanelDetailEmbed(panelId)], components: buildPanelDetailComponents(panelId) });
      }
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      if (action === 'add' || action === 'remove') {
        const modalId = `panelapps_${action}_${panelId}_${Date.now()}`;
        const m = new ModalBuilder().setCustomId(modalId).setTitle(action==='add'?'Add Application':'Remove Application')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('appid').setLabel('Application ID').setStyle(TextInputStyle.Short).setRequired(true)));
        await interaction.showModal(m);
        const submitted = await interaction.awaitModalSubmit({ time:60000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
        if (!submitted) return;
        const raw = submitted.fields.getTextInputValue('appid').trim();
        const appId = raw.replace(/[^0-9]/g,'');
        if (!appId) return submitted.reply({ content:'Invalid ID.', flags:1<<6 }).catch(()=>{});
        if (action === 'add') {
          if (!panel.applicationIds.includes(appId)) updatePanel(panel.id, { applicationIds: [...panel.applicationIds, appId] });
          return submitted.reply({ content:'Added application to panel.', flags:1<<6 }).catch(()=>{});
        } else {
          if (panel.applicationIds.includes(appId)) updatePanel(panel.id, { applicationIds: panel.applicationIds.filter(i=>i!==appId) });
          return submitted.reply({ content:'Removed application.', flags:1<<6 }).catch(()=>{});
        }
      }
    }
    if (id.startsWith('appmgr_panel_deploy_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId);
      if (!panel) return interaction.reply({ content: 'Panel missing.', flags: 1<<6 }).catch(()=>{});
      const channel = interaction.channel; // For phase 1, deploy in current channel.
      // Build a simple panel embed listing apps with Apply buttons.
      const apps = (panel.applicationIds||[]).map(id => getApplication(id)).filter(Boolean).filter(a=>a.enabled);
      const panelEmbed = createEmbed({ title: panel.name || `Panel #${panel.id}`, description: panel.description || 'Select an application below.' });
      if (apps.length === 0) safeAddField(panelEmbed, 'Empty', 'No enabled applications linked.');
      else for (const app of apps) safeAddField(panelEmbed, `#${app.id} ${app.name}`, `${app.questions.length} question(s)`);
      // Build rows of buttons (max 5 per row) custom_id: apply_app_<id>
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const rows = [];
      let current = new ActionRowBuilder();
      for (const app of apps) {
        if (current.components.length >= 5) { rows.push(current); current = new ActionRowBuilder(); }
        current.addComponents(new ButtonBuilder().setCustomId(`apply_app_${app.id}`).setLabel(app.name.slice(0,75)).setStyle(ButtonStyle.Primary));
      }
      if (current.components.length) rows.push(current);
      try {
        const sent = await channel.send({ embeds: [panelEmbed], components: rows.slice(0,5) });
        updatePanel(panel.id, { channelId: channel.id, messageId: sent.id, messageJSON: { embed: panelEmbed.data } });
        return interaction.reply({ content: 'Panel deployed.', flags: 1<<6 }).catch(()=>{});
      } catch (e) {
        try { require('../utils/logger').error('[applications] panel deploy failed', { err: e.message }); } catch {}
        return interaction.reply({ content: 'Failed to deploy panel.', flags: 1<<6 }).catch(()=>{});
      }
    }
    if (id === 'appmgr_back_panels') {
      session.data.view = 'panels'; session.data.panelId = null;
      const { embed, page, totalPages } = buildPanelsListEmbed(session.data.page || 0);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages) });
    }
  } catch (err) {
    try {
      require('../utils/logger').error('[applications] handler error', { err: err.message, stack: err.stack });
      if (err.data && err.data.components) {
        require('../utils/logger').error('[applications] Discord API error', { data: err.data });
      }
    } catch {}
    if (interaction.isRepliable && typeof interaction.isRepliable === 'function' && interaction.isRepliable() && !interaction.replied) {
      interaction.reply({ content: 'Error handling interaction.', flags: 1 << 6 }).catch(()=>{});
    }
  }
});

// Legacy style export similar to other command modules
// Export internals for testing and reuse (non-breaking addition)
module.exports = { handleApplicationsCommand, _test: {
  buildApplicationsListComponents,
  buildApplicationsListEmbed,
  buildPanelsListComponents,
  buildPanelsListEmbed
} };
