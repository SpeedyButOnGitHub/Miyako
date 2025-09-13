const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getEvents, getEvent, addEvent, updateEvent, removeEvent } = require('../../services/scheduleService');
const { OWNER_ID } = require('../moderation/permissions');
const ActiveMenus = require('../../utils/activeMenus');
const { config } = require('../../utils/storage');
const { safeReply } = require('../../utils/safeReply');

const { parseOffsetInput, parseDeleteAfterMs } = require('./helpers');
const { DAY_NAMES, buildMainEmbed, buildDetailEmbed, mainRows, buildSelectRows, detailRows } = require('./ui');
const { buildNotifsEmbed, notifManagerRows, notifSelectRows, notifDetailRows, refreshTrackedAutoMessages } = require('./notifications');
const { ensureAnchor, manualTriggerAutoMessage } = require('./actions');

function visibleEvents() {
  const events = getEvents();
  // Filter test events when testingMode is enabled
  if (config && config.testingMode) return events.filter(e => !(e.__testEvent || (typeof e.name === 'string' && e.name.startsWith('CI Test'))));
  return events;
}

async function handleScheduleCommand(client, message) {
  if (message.author.id !== OWNER_ID) return;
  const events = visibleEvents();
  const embed = buildMainEmbed(message.guild, events);
  const sent = await message.reply({ embeds: [embed], components: mainRows(events), allowedMentions: { repliedUser: false } }).catch(()=>null);
  if (sent) ActiveMenus.registerMessage(sent, { type: 'events', userId: message.author.id, data: { mode: 'main' } });
  return sent;
}

async function handleEventCreateModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('event_create_modal_')) return;
  const parts = interaction.customId.split('_');
  const managerMessageId = parts.slice(3).join('_') || null;
  const name = interaction.fields.getTextInputValue('name').trim();
  let channelId = interaction.fields.getTextInputValue('channel').trim().replace(/[<#>]/g,'');
  const timesRaw = interaction.fields.getTextInputValue('times').trim();
  const daysRaw = interaction.fields.getTextInputValue('days').trim();
  const messageContent = interaction.fields.getTextInputValue('message');
  const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const healJSON = (txt) => txt.replace(/^```(json)?/i,'').replace(/```$/,'').trim().replace(/,\s*([}\]])/g,'$1');
  const clamp = (s,max=1900)=> (s && s.length>max? s.slice(0,max-3)+'...':s);
  if (!name) return safeReply(interaction, { content: '❌ Name required.', flags:1<<6 });
  if (!/^\d{1,32}$/.test(channelId)) return safeReply(interaction, { content: '❌ Invalid channel id.', flags:1<<6 });
  const times = timesRaw.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean);
  if (!times.length) return safeReply(interaction, { content: '❌ Provide times.', flags:1<<6 });
  const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
  const days = daysRaw.split(/[,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
  if (!days.length) return safeReply(interaction, { content: '❌ Invalid days.', flags:1<<6 });
  let messageJSON = null;
  const healed = healJSON(messageContent);
  if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
  if (messageJSON?.content) messageJSON.content = clamp(messageJSON.content, 2000);
  const base = messageJSON?.content || clamp(messageContent,2000);
  const ev = addEvent({
    name,
    description: name,
    channelId,
    message: messageContent,
    messageJSON,
    ranges,
    enabled: true,
    times,
    days,
    dynamicBaseContent: base,
    type: 'multi-daily',
    color: 0x00aa00
  });
  try { await ensureAnchor(interaction, ev, { content: base }); } catch {}
  const jsonNote = messageJSON ? ' (JSON payload detected)' : '';
  await interaction.reply({ content: `✅ Event ${ev.name} created with ${ev.times.length} time(s).${jsonNote}`, flags:1<<6 }).catch(()=>{});
  if (managerMessageId) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId).catch(()=>null);
      if (mgrMsg) {
        const events = getEvents();
        await mgrMsg.edit({ embeds: [buildMainEmbed(interaction.guild, events)], components: mainRows(events) }).catch(()=>{});
      }
    } catch {}
  }
}

async function handleScheduleModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('schedule_create_modal')) return;
  await interaction.reply({ content: 'Scheduling system deprecated. Use Events Manager.', flags:1<<6 }).catch(()=>{});
}

async function handleEventEditModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^event_(times|days|msg|edit)_modal_/.test(interaction.customId)) return;
  const parts = interaction.customId.split('_');
  const eventId = parts[3];
  const managerMessageId = parts[4] || null;
  if (!/^\d+$/.test(eventId)) { await interaction.reply({ content: '❌ Bad event id.', flags: 1<<6 }).catch(()=>{}); return; }
  const ev = getEvent(eventId);
  if (!ev) { await interaction.reply({ content: 'Event not found.', flags:1<<6 }).catch(()=>{}); return; }
  let updatedEv = null;
  if (interaction.customId.startsWith('event_times_modal_')) {
    const raw = interaction.fields.getTextInputValue('times');
  const times = raw.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean);
    const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
    if (!times.length) { await interaction.reply({ content:'❌ Provide times.', flags:1<<6 }).catch(()=>{}); return; }
    updatedEv = updateEvent(ev.id, { times, ranges });
    await interaction.reply({ content:'✅ Times updated.', flags:1<<6 }).catch(()=>{});
  } else if (interaction.customId.startsWith('event_days_modal_')) {
    const raw = interaction.fields.getTextInputValue('days');
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const days = raw.split(/[,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
    if (!days.length) { await interaction.reply({ content:'❌ Invalid days.', flags:1<<6 }).catch(()=>{}); return; }
    updatedEv = updateEvent(ev.id, { days });
    await interaction.reply({ content:'✅ Days updated.', flags:1<<6 }).catch(()=>{});
  } else if (interaction.customId.startsWith('event_msg_modal_')) {
    const messageContent = interaction.fields.getTextInputValue('message');
    let messageJSON = null;
    const cleaned = messageContent.replace(/^```(json)?/i,'').replace(/```$/,'').trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) { try { const parsed = JSON.parse(cleaned); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    updatedEv = updateEvent(ev.id, { message: messageContent, messageJSON });
    await interaction.reply({ content:`✅ Message updated${messageJSON ? ' (JSON payload detected)' : ''}.`, flags:1<<6 }).catch(()=>{});
  } else if (interaction.customId.startsWith('event_edit_modal_')) {
    const name = interaction.fields.getTextInputValue('name').trim();
    let channelId = interaction.fields.getTextInputValue('channel').trim().replace(/[<#>]/g,'');
    const timesRaw = interaction.fields.getTextInputValue('times').trim();
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const messageContent = interaction.fields.getTextInputValue('message');
  const times = timesRaw.split(/[,\s]+/).map(t=>t.trim()).filter(Boolean);
    const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const days = daysRaw.split(/[,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
  if (!name) return safeReply(interaction, { content:'❌ Name required.', flags:1<<6 });
  if (!/^\d{1,32}$/.test(channelId)) return safeReply(interaction, { content:'❌ Invalid channel id.', flags:1<<6 });
  if (!times.length) return safeReply(interaction, { content:'❌ Provide times.', flags:1<<6 });
  if (!days.length) return safeReply(interaction, { content:'❌ Invalid days.', flags:1<<6 });
    let messageJSON = null;
    const cleaned = messageContent.replace(/^```(json)?/i,'').replace(/```$/,'').trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) { try { const parsed = JSON.parse(cleaned); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    updatedEv = updateEvent(ev.id, { name, channelId, times, ranges, days, message: messageContent, messageJSON, dynamicBaseContent: messageJSON?.content || messageContent });
    try { await ensureAnchor(interaction, updatedEv, { content: messageJSON?.content || messageContent }); } catch {}
    await interaction.reply({ content:`✅ Event updated${messageJSON? ' (JSON payload detected)':''}.`, flags:1<<6 }).catch(()=>{});
  }
  if (managerMessageId && updatedEv) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId).catch(() => null);
      if (mgrMsg) {
        const isDetail = mgrMsg.components.some(r => r.components.some(c => c.customId === `events_toggle_${updatedEv.id}`));
        if (isDetail) {
          await mgrMsg.edit({ embeds: [buildDetailEmbed(interaction.guild, updatedEv)], components: detailRows(updatedEv) }).catch(() => {});
        } else {
          const events = getEvents();
          await mgrMsg.edit({ embeds: [buildMainEmbed(interaction.guild, events)], components: mainRows(events) }).catch(() => {});
        }
      }
    } catch {}
  }
}

async function handleEventNotificationModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  // Consolidated handling: only 'add' and unified 'edit' modals remain
  if (!/^(notif_(add|edit)_modal_)/.test(interaction.customId)) return;
  const parts = interaction.customId.split('_');
  const kind = parts[1];
  const evId = parts[3];
  const notifId = (kind==='add') ? null : parts[4];
  const managerMessageId = (kind==='add') ? parts[4] : parts[5];
  const ev = getEvent(evId);
  if (!ev) { await interaction.reply({ content:'Event missing.', flags:1<<6 }).catch(()=>{}); return; }
  const healJSON = (txt) => txt.replace(/^```(json)?/i,'').replace(/```$/,'').trim().replace(/,\s*([}\]])/g,'$1');
  let updatedEv = null;
  if (kind==='add') {
    const offsetRaw = interaction.fields.getTextInputValue('offset');
    const offset = parseOffsetInput(offsetRaw);
    const msgRaw = interaction.fields.getTextInputValue('message');
    const chanRaw = (interaction.fields.getTextInputValue('channel')||'').trim();
    const deleteAfterRaw = interaction.fields.getTextInputValue('deleteafter');
    const deleteAfterMs = parseDeleteAfterMs(deleteAfterRaw);
    let mentionsRaw = '';
    try { mentionsRaw = (interaction.fields.getTextInputValue('mentions')||'').trim(); } catch {}
    const msgChannelId = chanRaw.replace(/[<#>]/g,'');
  if (msgChannelId && !/^\d{1,32}$/.test(msgChannelId)) { return safeReply(interaction, { content:'❌ Invalid channel id.', flags:1<<6 }); }
    let messageJSON = null;
    const healed = healJSON(msgRaw);
    if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const nextId = String(ev.nextAutoId || 1);
    const entry = { id: nextId, offsetMinutes: offset, enabled: true, message: msgRaw, messageJSON };
    if (msgChannelId) entry.channelId = msgChannelId;
    if (Number.isFinite(deleteAfterMs)) entry.deleteAfterMs = deleteAfterMs; // 0 disables, >0 TTL; absence -> fallback default
    if (mentionsRaw) {
      const roleIds = Array.from(new Set(mentionsRaw.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/[<@&#>]/g,'')).filter(id=>/^\d{5,32}$/.test(id))));
      if (roleIds.length) entry.mentions = roleIds;
    }
    list.push(entry);
    updatedEv = updateEvent(ev.id, { autoMessages: list, nextAutoId: Number(nextId)+1 });
    await interaction.reply({ content:`✅ Auto message #${nextId} created${messageJSON?' (JSON)':''}.`, flags:1<<6 }).catch(()=>{});
  } else if (kind==='edit') {
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
  if (idx===-1) return safeReply(interaction, { content:'Not found.', flags:1<<6 });
    const chanRaw = (interaction.fields.getTextInputValue('channel')||'').trim();
    const cleanedChan = chanRaw.replace(/[<#>]/g,'');
  if (cleanedChan && !/^\d{1,32}$/.test(cleanedChan)) return safeReply(interaction, { content:'❌ Invalid channel id.', flags:1<<6 });
    const offsetRaw = interaction.fields.getTextInputValue('offset');
    const offset = parseOffsetInput(offsetRaw);
    const deleteAfterRaw = interaction.fields.getTextInputValue('deleteafter');
    const deleteAfterMs = parseDeleteAfterMs(deleteAfterRaw);
    const msgRaw = interaction.fields.getTextInputValue('message');
    let mentionsRaw = '';
    try { mentionsRaw = (interaction.fields.getTextInputValue('mentions')||'').trim(); } catch {}
    let messageJSON = null; const healed = healJSON(msgRaw); if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    const newList = list.map(entry => {
      const e = { ...entry };
      if (String(e.id) === String(notifId)) {
        e.offsetMinutes = offset;
        e.message = msgRaw;
        e.messageJSON = messageJSON;
        e.deleteAfterMs = deleteAfterMs;
        if (cleanedChan) e.channelId = cleanedChan; else delete e.channelId;
        if (mentionsRaw) {
          const roleIds = Array.from(new Set(mentionsRaw.split(/[\s,]+/).map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/[<@&#>]/g,'')).filter(id=>/^\d{5,32}$/.test(id))));
          if (roleIds.length) e.mentions = roleIds; else delete e.mentions;
        } else {
          delete e.mentions; // allow clearing by leaving field blank
        }
      }
      return e;
    });
    updatedEv = updateEvent(ev.id, { autoMessages: newList });
    await interaction.reply({ content:'✅ Auto messages updated for this event.', flags:1<<6 }).catch(()=>{});
    try { await refreshTrackedAutoMessages(interaction.client, updatedEv); } catch {}
  }
  if (managerMessageId && updatedEv) {
    try {
      const channel = interaction.channel;
      const mgrMsg = await channel.messages.fetch(managerMessageId).catch(()=>null);
      if (mgrMsg) {
        if (mgrMsg.components.some(r=>r.components.some(c=>c.customId?.startsWith('event_notif_')))) {
          await mgrMsg.edit({ embeds:[buildNotifsEmbed(interaction.guild, updatedEv)], components: notifManagerRows(updatedEv) }).catch(()=>{});
        } else if (mgrMsg.components.some(r=>r.components.some(c=>c.customId===`events_toggle_${updatedEv.id}`))) {
          await mgrMsg.edit({ embeds:[buildDetailEmbed(interaction.guild, updatedEv)], components: detailRows(updatedEv) }).catch(() => {});
        }
      }
    } catch {}
  }
}

// ActiveMenus wiring
ActiveMenus.registerHandler('events', async (interaction, session) => {
  if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Not for you.', flags: 1<<6 });
  const data = session.data || {};
  const customId = interaction.customId;

  if (customId === 'events_create') {
    const modal = new ModalBuilder().setCustomId(`event_create_modal_${interaction.message.id}`).setTitle('Create Event')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID or #channel').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM,comma)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
    await interaction.showModal(modal); return;
  }
  if (customId === 'events_select_mode') {
    data.mode = 'select';
    const events = visibleEvents();
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: buildSelectRows('select', events) });
    session.data = data; return;
  }
  if (customId === 'events_delete_mode') {
    data.mode = 'delete';
    const events = visibleEvents();
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: buildSelectRows('delete', events) });
    session.data = data; return;
  }
  if (customId === 'events_back') {
    data.mode = 'main'; data.currentId = null;
    const events = visibleEvents();
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: mainRows(events) });
    session.data = data; return;
  }

  if (customId.startsWith('events_toggle_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const updated = updateEvent(id, { enabled: !ev.enabled });
    await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, updated)], components: detailRows(updated) });
    return;
  }
  if (customId.startsWith('events_edit_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const modal = new ModalBuilder().setCustomId(`event_edit_modal_${id}_${interaction.message.id}`).setTitle('Edit Event')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(ev.name || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true).setValue(ev.channelId || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM or HH:MM-HH:MM, comma)').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((ev.times||[]).join(','))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true).setValue((ev.days||[]).map(d=>DAY_NAMES[d]||d).join(','))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message / JSON').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(ev.message || (ev.messageJSON? JSON.stringify(ev.messageJSON,null,2):'')))
      );
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_notifs_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags:1<<6 });
    if (!Array.isArray(ev.autoMessages)) updateEvent(ev.id, { autoMessages: [] });
    await interaction.update({ embeds: [buildNotifsEmbed(interaction.guild, getEvent(id))], components: notifManagerRows(ev) });
    return;
  }
  if (customId.startsWith('event_notif_back_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, ev)], components: detailRows(ev) });
    return;
  }
  if (customId.startsWith('event_notif_add_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const modal = new ModalBuilder().setCustomId(`notif_add_modal_${id}_${interaction.message.id}`).setTitle('Add Auto Message')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID (blank=event)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(ev.channelId||'')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('offset').setLabel('When before start? (e.g. 15m, 1h, 2h30m)').setStyle(TextInputStyle.Short).setRequired(true).setValue('5m')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('deleteafter').setLabel('Delete after (e.g. 10m, 0=disable)').setStyle(TextInputStyle.Short).setRequired(true).setValue('0')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mentions').setLabel('Role IDs to ping (comma/space)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('123,456 789')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message / JSON').setStyle(TextInputStyle.Paragraph).setRequired(true))
      );
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('event_notif_edit_')) {
    const parts = customId.split('_');
    const evId = parts[3]; const notifId = parts[4];
    const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
    if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const currentTTL = Number.isFinite(notif.deleteAfterMs) ? notif.deleteAfterMs : (config.autoMessages?.defaultDeleteMs || 0);
    const suggestTTL = currentTTL<=0 ? '0' : (currentTTL%3600000===0 ? `${Math.floor(currentTTL/3600000)}h` : (currentTTL%60000===0 ? `${Math.floor(currentTTL/60000)}m` : `${Math.max(1,Math.floor(currentTTL/1000))}s`));
    const modal = new ModalBuilder().setCustomId(`notif_edit_modal_${evId}_${notifId}_${interaction.message.id}`).setTitle('Edit Auto Message')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID (blank=event)').setStyle(TextInputStyle.Short).setRequired(false).setValue(notif.channelId||'')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('offset').setLabel('When before start? (e.g. 10m, 2h)').setStyle(TextInputStyle.Short).setRequired(true).setValue(notif.offsetMinutes? `${notif.offsetMinutes}m` : 'start')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('deleteafter').setLabel('Delete after (e.g. 10m, 2h, 0=disable)').setStyle(TextInputStyle.Short).setRequired(true).setValue(suggestTTL)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mentions').setLabel('Role IDs to ping (comma/space)').setStyle(TextInputStyle.Short).setRequired(false).setValue((notif.mentions||[]).join(','))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message / JSON').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(notif.message || (notif.messageJSON? JSON.stringify(notif.messageJSON,null,2):'')))
      );
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('event_notif_selectmode_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    await interaction.update({ embeds: [buildNotifsEmbed(interaction.guild, ev)], components: notifSelectRows(ev) });
    return;
  }
  if (customId.startsWith('event_notif_cancel_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    await interaction.update({ embeds: [buildNotifsEmbed(interaction.guild, ev)], components: notifManagerRows(ev) });
    return;
  }
  if (customId.startsWith('event_notif_toggle_')) {
    const parts = customId.split('_');
    const evId = parts[3]; const notifId = parts[4];
    const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
    if (idx===-1) return interaction.reply({ content:'Not found.', flags:1<<6 });
    list[idx].enabled = !list[idx].enabled;
    updateEvent(ev.id, { autoMessages: list });
    await interaction.update({ embeds:[buildNotifsEmbed(interaction.guild, getEvent(evId))], components: notifDetailRows(ev, list[idx]) });
    return;
  }
  if (customId.startsWith('event_notif_trigger_')) {
    const parts = customId.split('_');
    const evId = parts[3]; const notifId = parts[4];
    const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
    if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    try {
      const sentOk = await manualTriggerAutoMessage(interaction, ev, notif);
      await interaction.reply({ content: sentOk ? `✅ Triggered auto message #${notif.id}${config.testingMode?' (testing mode output only)':''}.` : '❌ Failed to send message.', flags:1<<6 }).catch(()=>{});
    } catch (e) {
      await interaction.reply({ content: '❌ Error: '+(e.message||e), flags:1<<6 }).catch(()=>{});
    }
    return;
  }
  if (customId.startsWith('events_delete_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    removeEvent(id);
    data.mode = 'main'; data.currentId = null;
    const events = visibleEvents();
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: mainRows(events) });
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (customId === 'events_select') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', flags: 1<<6 });
      data.mode = 'detail'; data.currentId = id;
      await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, ev)], components: detailRows(ev) });
      return;
    }
    if (customId === 'events_delete') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', flags: 1<<6 });
      removeEvent(id);
      const events = getEvents();
      if (!events.length) {
        data.mode = 'main';
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: mainRows(events) });
      } else {
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild, events)], components: buildSelectRows('delete', events) });
      }
      return;
    }
    if (customId.startsWith('event_notif_select_')) {
      const evId = customId.split('_').pop();
      const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
      const notifId = interaction.values[0];
      const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
      if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
      await interaction.update({ embeds:[buildNotifsEmbed(interaction.guild, ev)], components: notifDetailRows(ev, notif) });
      return;
    }
  }
});

module.exports = {
  handleScheduleCommand,
  handleScheduleModal,
  handleEventCreateModal,
  handleEventEditModal,
  handleEventNotificationModal,
  ensureAnchor,
  manualTriggerAutoMessage,
  refreshTrackedAutoMessages,
};
