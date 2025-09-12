// Staff Applications System - Root Command & ActiveMenus handler (Phase 1)
// Provides interactive management UI for Applications and Panels. Submission flow & manager actions added in later phases.

const ActiveMenus = require('../utils/activeMenus');
const theme = require('../utils/theme');
const { createEmbed, safeAddField } = require('../utils/embeds');
const { semanticButton, buildNavRow, diffEditMessage } = require('../ui');
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
  const row1 = buildNavRow([
    semanticButton('primary', { id: 'appmgr_apps', label: 'Applications', emoji: theme.emojis.edit }),
    semanticButton('primary', { id: 'appmgr_panels', label: 'Panels', emoji: theme.emojis.settings }),
    semanticButton('success', { id: 'appmgr_new_app', label: 'New App', emoji: theme.emojis.create }),
    semanticButton('success', { id: 'appmgr_new_panel', label: 'New Panel', emoji: theme.emojis.create }),
  ]);
  return [row1];
}

function buildApplicationsListEmbed(page = 0, pageSize = 5) {
  const apps = listApplications();
  const totalPages = Math.max(1, Math.ceil(apps.length / pageSize));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const slice = apps.slice(page * pageSize, page * pageSize + pageSize);
  const e = createEmbed({ title: 'Applications', description: `Page ${page + 1}/${totalPages} • ${apps.length} total` });
  if (!slice.length) safeAddField(e, 'Empty', 'No applications yet.');
  for (const a of slice) {
    safeAddField(e, `#${a.id} ${a.enabled ? '🟢' : '🔴'} ${a.name}`, `${a.questions.length} question(s)`);
  }
  return { embed: e, page, totalPages };
}

function buildApplicationsListComponents(page, totalPages) {
  const prev = semanticButton('nav', { id: 'appmgr_apps_prev', label: 'Prev', enabled: page > 0 });
  const next = semanticButton('nav', { id: 'appmgr_apps_next', label: 'Next', enabled: page < totalPages - 1 });
  const back = semanticButton('secondary', { id: 'appmgr_back_root', label: 'Back' });
  const row = buildNavRow([prev, next, back]);
  return [row];
}

function buildPanelsListEmbed(page = 0, pageSize = 5) {
  const panels = listPanels();
  const totalPages = Math.max(1, Math.ceil(panels.length / pageSize));
  page = Math.min(Math.max(0, page), totalPages - 1);
  const slice = panels.slice(page * pageSize, page * pageSize + pageSize);
  const e = createEmbed({ title: 'Panels', description: `Page ${page + 1}/${totalPages} • ${panels.length} total` });
  if (!slice.length) safeAddField(e, 'Empty', 'No panels yet.');
  for (const p of slice) {
    safeAddField(e, `#${p.id} ${p.name}`, `${p.applicationIds.length} application(s)`);
  }
  return { embed: e, page, totalPages };
}

function buildPanelsListComponents(page, totalPages) {
  const prev = semanticButton('nav', { id: 'appmgr_panels_prev', label: 'Prev', enabled: page > 0 });
  const next = semanticButton('nav', { id: 'appmgr_panels_next', label: 'Next', enabled: page < totalPages - 1 });
  const back = semanticButton('secondary', { id: 'appmgr_back_root', label: 'Back' });
  const row = buildNavRow([prev, next, back]);
  return [row];
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
  return e;
}

function buildAppDetailComponents(appId) {
  const app = getApplication(appId);
  const back = semanticButton('secondary', { id: 'appmgr_back_apps', label: 'Back' });
  if (!app) return [buildNavRow([back])];
  const toggle = semanticButton('toggle', { id: `appmgr_app_toggle_${app.id}`, label: app.enabled ? 'Disable' : 'Enable', active: app.enabled });
  const rename = semanticButton('primary', { id: `appmgr_app_rename_${app.id}`, label: 'Rename', emoji: theme.emojis.edit });
  const del = semanticButton('danger', { id: `appmgr_app_delete_${app.id}`, label: 'Delete', emoji: theme.emojis.delete });
  const qBtn = semanticButton('primary', { id: `appmgr_app_questions_${app.id}`, label: 'Questions' });
  const msgBtn = semanticButton('primary', { id: `appmgr_app_msgs_${app.id}`, label: 'Messages' });
  const row1 = buildNavRow([toggle, rename, qBtn, msgBtn, del, back].slice(0,5));
  const row2 = buildNavRow([toggle, rename, qBtn, msgBtn, del, back].slice(5));
  return [row1, row2].filter(r=>r && r.components && r.components.length);
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
  const nav = buildNavRow([
    semanticButton('nav', { id: `appq_prev_${appId}`, label: 'Prev', enabled: page>0 }),
    semanticButton('nav', { id: `appq_next_${appId}`, label: 'Next', enabled: page < totalPages-1 }),
    semanticButton('success', { id: `appq_add_${appId}`, label: 'Add' }),
    semanticButton('primary', { id: `appq_edit_${appId}`, label: 'Edit' }),
    semanticButton('danger', { id: `appq_del_${appId}`, label: 'Delete' }),
  ]);
  const nav2 = buildNavRow([
    semanticButton('primary', { id: `appq_reorder_${appId}`, label: 'Reorder' }),
    semanticButton('secondary', { id: `appq_back_${appId}`, label: 'Back' })
  ]);
  return [nav, nav2];
}

function buildPanelDetailEmbed(panelId) {
  const panel = getPanel(panelId);
  if (!panel) return createEmbed({ title: 'Missing Panel', description: 'It may have been removed.' });
  const e = createEmbed({ title: `Panel #${panel.id}`, description: panel.name });
  safeAddField(e, 'Applications', panel.applicationIds.length ? panel.applicationIds.map(id => `#${id}`).join(', ') : '*none*');
  safeAddField(e, 'Channel', panel.channelId ? `<#${panel.channelId}>` : '*none set*');
  return e;
}

function buildPanelDetailComponents(panelId) {
  const panel = getPanel(panelId);
  const back = semanticButton('secondary', { id: 'appmgr_back_panels', label: 'Back' });
  if (!panel) return [buildNavRow([back])];
  const rename = semanticButton('primary', { id: `appmgr_panel_rename_${panel.id}`, label: 'Rename', emoji: theme.emojis.edit });
  const del = semanticButton('danger', { id: `appmgr_panel_delete_${panel.id}`, label: 'Delete', emoji: theme.emojis.delete });
  const deploy = semanticButton('success', { id: `appmgr_panel_deploy_${panel.id}`, label: 'Deploy' });
  const row1 = buildNavRow([rename, deploy, del, back]);
  return [row1];
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
      const { embed, page, totalPages } = buildApplicationsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages) });
    }
    if (id === 'appmgr_panels') {
      session.data.view = 'panels'; session.data.page = 0;
      const { embed, page, totalPages } = buildPanelsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages) });
    }
    if (id === 'appmgr_new_app') {
      const created = addApplication({});
      session.data.view = 'appDetail'; session.data.appId = created.id;
      return interaction.update({ embeds: [buildAppDetailEmbed(created.id)], components: buildAppDetailComponents(created.id) });
    }
    if (id === 'appmgr_new_panel') {
      const created = addPanel({});
      session.data.view = 'panelDetail'; session.data.panelId = created.id;
      return interaction.update({ embeds: [buildPanelDetailEmbed(created.id)], components: buildPanelDetailComponents(created.id) });
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
      const { embed, page, totalPages: tp } = buildApplicationsListEmbed(newPage);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, tp) });
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
      const { embed, page, totalPages: tp } = buildPanelsListEmbed(newPage);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, tp) });
    }
    // App detail buttons dynamic patterns
    if (id.startsWith('appmgr_app_toggle_')) {
      const appId = id.split('_').pop();
      const app = getApplication(appId);
      if (app) updateApplication(app.id, { enabled: !app.enabled });
      return interaction.update({ embeds: [buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
    }
    if (id.startsWith('appmgr_app_delete_')) {
      const appId = id.split('_').pop();
      removeApplication(appId);
      session.data.view = 'apps'; session.data.appId = null;
      const { embed, page, totalPages } = buildApplicationsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildApplicationsListComponents(page, totalPages) });
    }
    if (id.startsWith('appmgr_app_rename_')) {
      // Placeholder: next phase will open a modal. For now toggle name for quick visual.
      const appId = id.split('_').pop();
      const app = getApplication(appId);
      if (app) {
        const newName = app.name.endsWith(' *') ? app.name.replace(/ \*$/, '') : app.name + ' *';
        updateApplication(app.id, { name: newName });
      }
      return interaction.update({ embeds: [buildAppDetailEmbed(appId)], components: buildAppDetailComponents(appId) });
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
        semanticButton('secondary', { id:`appmsg_back_${appId}`, label:'Back' })
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
        const { embed, page:np, totalPages } = buildQuestionListEmbed(appId, session.data.qPage||0);
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
    if (id.startsWith('appmgr_panel_delete_')) {
      const panelId = id.split('_').pop();
      removePanel(panelId);
      session.data.view = 'panels'; session.data.panelId = null;
      const { embed, page, totalPages } = buildPanelsListEmbed(0);
      return interaction.update({ embeds: [embed], components: buildPanelsListComponents(page, totalPages) });
    }
    if (id.startsWith('appmgr_panel_rename_')) {
      const panelId = id.split('_').pop();
      const panel = getPanel(panelId);
      if (panel) {
        const newName = panel.name.endsWith(' *') ? panel.name.replace(/ \*$/, '') : panel.name + ' *';
        updatePanel(panel.id, { name: newName });
      }
      return interaction.update({ embeds: [buildPanelDetailEmbed(panelId)], components: buildPanelDetailComponents(panelId) });
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
    try { require('../utils/logger').error('[applications] handler error', { err: err.message }); } catch {}
    if (interaction.isRepliable() && !interaction.replied) {
      interaction.reply({ content: 'Error handling interaction.', flags: 1 << 6 }).catch(()=>{});
    }
  }
});

// Legacy style export similar to other command modules
module.exports = { handleApplicationsCommand };
