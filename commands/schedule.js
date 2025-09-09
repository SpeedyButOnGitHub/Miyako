const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { addSchedule, getSchedules, removeSchedule, getSchedule, updateSchedule } = require("../utils/scheduleStorage"); // kept for compatibility (not UI-exposed now)
const { getEvents, getEvent, addEvent, updateEvent, removeEvent } = require("../utils/eventsStorage");
const { computeNextRun } = require("../utils/scheduler");
const { OWNER_ID } = require("./moderation/permissions");
const theme = require("../utils/theme");
const ActiveMenus = require("../utils/activeMenus");
const { applyFooterWithPagination } = require("../utils/ui");

// --- Event Manager (ActiveMenus) ---

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function summarizeEvent(ev) {
  const times = (ev.times || []).join(", ") || "–";
  const days = (ev.days || []).map(d => DAY_NAMES[d] || d).join(" ") || "All";
  const clock = (theme.emojis && (theme.emojis.times || theme.emojis.time)) || '🕒';
  const repeat = (theme.emojis && (theme.emojis.repeat || theme.emojis.days)) || '🔁';
  // Layout: status + bold name on first line; second line shows time(s) and repeats (days)
  return `${ev.enabled ? (theme.emojis.enable || '✅') : (theme.emojis.disable || '❌')} **${ev.name}**\n${clock} ${times} • ${repeat} ${days}`;
}

function buildMainEmbed(guild) {
  const evs = getEvents();
  const embed = new EmbedBuilder()
  .setTitle(`${theme.emojis.toggle || '🗓️'} Events Manager`)
  .setColor(theme.colors.primary)
  .setDescription(evs.length ? evs.map(summarizeEvent).join("\n\n") : "*No events defined yet.*");
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: `${evs.length} event${evs.length === 1 ? '' : 's'}` });
  return embed;
}

function buildDetailEmbed(guild, ev) {
  const times = (ev.times || []).length ? ev.times.join(", ") : "(none)";
  const days = (ev.days || []).length ? ev.days.map(d => DAY_NAMES[d] || d).join(", ") : "(none)";
  // Derive a short message preview. Prefer JSON payload summary if present.
  let msgPreview = ev.message ? (ev.message.length > 300 ? ev.message.slice(0,297)+"..." : ev.message) : "(none)";
  if (ev.messageJSON && typeof ev.messageJSON === 'object') {
    const json = ev.messageJSON;
    if (json.content) {
      msgPreview = `JSON: ${json.content.substring(0,120)}${json.content.length>120?"...":""}`;
    } else if (Array.isArray(json.embeds) && json.embeds.length) {
      const first = json.embeds[0];
      const t = first.title || first.description || '(embed)';
      msgPreview = `JSON Embed: ${String(t).substring(0,120)}${String(t).length>120?"...":""}`;
    } else {
      msgPreview = 'JSON payload';
    }
  }
  const embed = new EmbedBuilder()
    .setTitle(`${ev.enabled ? theme.emojis.enable : theme.emojis.disable} ${ev.name}`)
    .setColor(ev.enabled ? theme.colors.success : theme.colors.danger)
    .setDescription(ev.description || "No description provided.")
    .addFields(
      { name: "Status", value: ev.enabled ? "Enabled" : "Disabled", inline: true },
      { name: "Type", value: ev.type || "multi-daily", inline: true },
      { name: "Channel", value: ev.channelId ? `<#${ev.channelId}>` : "(none)", inline: true },
      { name: "Times", value: times, inline: false },
      { name: "Days", value: days, inline: false },
      { name: "Message", value: msgPreview }
    );
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: `Events Manager` });
  return embed;
}

function mainRows() {
  const evs = getEvents();
  // Order: Create, Delete, Select (no Close button per request)
  return [ new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("events_create").setLabel("Create").setEmoji(theme.emojis.create).setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("events_delete_mode").setLabel("Delete").setEmoji(theme.emojis.delete).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("events_select_mode").setLabel("Select").setEmoji(theme.emojis.events).setStyle(ButtonStyle.Primary).setDisabled(!evs.length)
  )];
}

function buildSelectRows(kind) {
  const evs = getEvents();
  const options = evs.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(' ').slice(0,100), emoji: kind === 'delete' ? theme.emojis.delete : (e.enabled?theme.emojis.enable:theme.emojis.disable) }));
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`events_${kind === 'delete' ? 'delete' : 'select'}`).setPlaceholder(kind==='delete'? 'Select event to delete' : 'Select event...').addOptions(options)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('events_back').setLabel('Back').setEmoji(theme.emojis.back).setStyle(ButtonStyle.Secondary))
  ];
}

function detailRows(ev) {
  // Simplified: Toggle / Edit / Delete / Back
  return [ new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`events_toggle_${ev.id}`).setLabel(ev.enabled? 'Disable':'Enable').setStyle(ev.enabled?ButtonStyle.Danger:ButtonStyle.Success).setEmoji(ev.enabled?theme.emojis.disable:theme.emojis.enable),
    new ButtonBuilder().setCustomId(`events_edit_${ev.id}`).setLabel('Edit').setStyle(ButtonStyle.Primary).setEmoji(theme.emojis.edit || theme.emojis.message || '✏️'),
    new ButtonBuilder().setCustomId(`events_delete_${ev.id}`).setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.delete),
    new ButtonBuilder().setCustomId('events_back').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji(theme.emojis.back)
  )];
}

// Helper: create or update anchor message automatically
async function ensureAnchor(interactionOrClient, ev, basePayloadOverride) {
  const client = interactionOrClient.client || interactionOrClient; // support Interaction or Client
  const channel = await client.channels.fetch(ev.channelId).catch(()=>null);
  if (!channel || !channel.send) return null;
  let baseContent = ev.dynamicBaseContent || (ev.messageJSON?.content) || ev.message || ev.name;
  if (basePayloadOverride && basePayloadOverride.content) baseContent = basePayloadOverride.content;
  const payload = ev.messageJSON ? { ...ev.messageJSON, content: baseContent } : { content: baseContent };
  if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
  let msg = null;
  if (ev.anchorMessageId) {
    msg = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
  }
  if (!msg) {
    msg = await channel.send(payload).catch(()=>null);
    if (msg) {
      updateEvent(ev.id, { anchorChannelId: channel.id, anchorMessageId: msg.id, dynamicBaseContent: baseContent });
    }
  } else {
    // Edit existing anchor if content changed or explicit override
    if (basePayloadOverride || (payload.content && payload.content !== msg.content)) {
      await msg.edit(payload).catch(()=>{});
    }
    // Ensure dynamicBaseContent stored
    if (!ev.dynamicBaseContent) updateEvent(ev.id, { dynamicBaseContent: baseContent });
  }
  return msg;
}

async function handleScheduleCommand(client, message) {
  // Owner-only: send Events Manager main UI and register ActiveMenus session
  if (message.author.id !== OWNER_ID) return;
  const embed = buildMainEmbed(message.guild);
  const sent = await message.reply({ embeds: [embed], components: mainRows(), allowedMentions: { repliedUser: false } }).catch(()=>null);
  if (sent) ActiveMenus.registerMessage(sent, { type: 'events', userId: message.author.id, data: { mode: 'main' } });
}

// Handle creation modal: id pattern event_create_modal_<managerMessageId>
async function handleEventCreateModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('event_create_modal_')) return;
  const parts = interaction.customId.split('_');
  const managerMessageId = parts.slice(3).join('_') || null; // manager message id may contain underscores if ever changed
  const name = interaction.fields.getTextInputValue('name').trim();
  let channelId = interaction.fields.getTextInputValue('channel').trim().replace(/[<#>]/g,'');
  const timesRaw = interaction.fields.getTextInputValue('times').trim();
  const daysRaw = interaction.fields.getTextInputValue('days').trim();
  const messageContent = interaction.fields.getTextInputValue('message');
  const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const healJSON = (txt) => {
    let c = txt.replace(/^```(json)?/i,'').replace(/```$/,'').trim();
    c = c.replace(/,\s*([}\]])/g,'$1');
    return c;
  };
  const clamp = (s,max=1900)=> (s && s.length>max? s.slice(0,max-3)+'...':s);
  if (!name) return interaction.reply({ content: '❌ Name required.', ephemeral:true }).catch(()=>{});
  if (!/^\d{1,32}$/.test(channelId)) return interaction.reply({ content: '❌ Invalid channel id.', ephemeral:true }).catch(()=>{});
  const times = timesRaw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
  if (!times.length) return interaction.reply({ content: '❌ Provide times.', ephemeral:true }).catch(()=>{});
  const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
  const days = daysRaw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
  if (!days.length) return interaction.reply({ content: '❌ Invalid days.', ephemeral:true }).catch(()=>{});
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
  try { await ensureAnchor(interaction, ev, { content: base }); } catch (e) { console.error('[anchor create]', e); }
  const jsonNote = messageJSON ? ' (JSON payload detected)' : '';
  await interaction.reply({ content: `✅ Event ${ev.name} created with ${ev.times.length} time(s).${jsonNote}`, ephemeral:true }).catch(()=>{});
  if (managerMessageId) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId).catch(()=>null);
      if (mgrMsg) await mgrMsg.edit({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() }).catch(()=>{});
    } catch {}
  }
}

// Legacy schedule modal (deprecated)
async function handleScheduleModal(interaction) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith('schedule_create_modal')) return;
  await interaction.reply({ content: 'Scheduling system deprecated. Use Events Manager.', ephemeral:true }).catch(()=>{});
}

// ActiveMenus handler
ActiveMenus.registerHandler('events', async (interaction, session) => {
  if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Not for you.', ephemeral: true });
  const data = session.data || {}; // { mode, currentId }
  const customId = interaction.customId;

  // Close button removed per request

  // Main actions
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
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('select') });
    session.data = data; return;
  }
  if (customId === 'events_delete_mode') {
    data.mode = 'delete';
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('delete') });
    session.data = data; return;
  }
  if (customId === 'events_back') {
    data.mode = 'main'; data.currentId = null;
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
    session.data = data; return;
  }

  // Detail actions
  if (customId.startsWith('events_toggle_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const updated = updateEvent(id, { enabled: !ev.enabled });
    await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, updated)], components: detailRows(updated) });
    return;
  }
  if (customId.startsWith('events_edit_times_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_times_modal_${id}_${interaction.message.id}`).setTitle('Edit Times')
  .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM or HH:MM-HH:MM, comma)').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((ev.times||[]).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_days_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_days_modal_${id}_${interaction.message.id}`).setTitle('Edit Days')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true).setValue((ev.days||[]).map(d=>DAY_NAMES[d]||d).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_msg_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId(`event_msg_modal_${id}_${interaction.message.id}`).setTitle('Edit Message')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message Content').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(ev.message || '')));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_delete_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
    removeEvent(id);
    data.mode = 'main'; data.currentId = null;
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
    return;
  }
  if (customId.startsWith('events_edit_')) {
    const id = customId.split('_').pop();
    const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', ephemeral: true });
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

  // Select menus
  if (interaction.isStringSelectMenu()) {
    if (customId === 'events_select') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', ephemeral: true });
      data.mode = 'detail'; data.currentId = id;
      await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, ev)], components: detailRows(ev) });
      return;
    }
    if (customId === 'events_delete') {
      const id = interaction.values[0];
      const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Not found.', ephemeral: true });
      removeEvent(id);
      // Stay in delete mode or back to main if empty
      const evs = getEvents();
      if (!evs.length) {
        data.mode = 'main';
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
      } else {
        await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: buildSelectRows('delete') });
      }
      return;
    }
  }
});

async function handleEventEditModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^event_(times|days|msg|edit)_modal_/.test(interaction.customId)) return;
  // pattern: event_<kind>_modal_<eventId>[_<managerMessageId>]
  const parts = interaction.customId.split("_");
  const eventId = parts[3];
  const managerMessageId = parts[4] || null;
  if (!/^\d+$/.test(eventId)) { await interaction.reply({ content: '❌ Bad event id.', ephemeral: true }).catch(()=>{}); return; }
  const ev = getEvent(eventId);
  if (!ev) { await interaction.reply({ content: "Event not found.", ephemeral:true }); return; }
  let updatedEv = null;
  if (interaction.customId.startsWith("event_times_modal_")) {
    const raw = interaction.fields.getTextInputValue("times");
    const times = raw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
  const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
    if (!times.length) { await interaction.reply({ content: "❌ Provide times.", ephemeral:true }); return; }
  updatedEv = updateEvent(ev.id, { times, ranges });
    await interaction.reply({ content: "✅ Times updated.", ephemeral:true });
  } else if (interaction.customId.startsWith("event_days_modal_")) {
    const raw = interaction.fields.getTextInputValue("days");
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    const days = raw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
    if (!days.length) { await interaction.reply({ content: "❌ Invalid days.", ephemeral:true }); return; }
    updatedEv = updateEvent(ev.id, { days });
    await interaction.reply({ content: "✅ Days updated.", ephemeral:true });
  } else if (interaction.customId.startsWith("event_msg_modal_")) {
    const messageContent = interaction.fields.getTextInputValue("message");
    let messageJSON = null;
    const cleaned = messageContent.replace(/^```(json)?/i, '').replace(/```$/,'').trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') messageJSON = parsed;
      } catch { /* ignore */ }
    }
    updatedEv = updateEvent(ev.id, { message: messageContent, messageJSON });
    await interaction.reply({ content: `✅ Message updated${messageJSON ? ' (JSON payload detected)' : ''}.`, ephemeral:true });
  } else if (interaction.customId.startsWith("event_edit_modal_")) {
    const name = interaction.fields.getTextInputValue('name').trim();
    let channelId = interaction.fields.getTextInputValue('channel').trim().replace(/[<#>]/g,'');
    const timesRaw = interaction.fields.getTextInputValue('times').trim();
    const daysRaw = interaction.fields.getTextInputValue('days').trim();
    const messageContent = interaction.fields.getTextInputValue('message');
    const times = timesRaw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
    const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    const days = daysRaw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
    if (!name) return interaction.reply({ content: '❌ Name required.', ephemeral:true });
    if (!/^\d{1,32}$/.test(channelId)) return interaction.reply({ content: '❌ Invalid channel id.', ephemeral:true });
    if (!times.length) return interaction.reply({ content: '❌ Provide times.', ephemeral:true });
    if (!days.length) return interaction.reply({ content: '❌ Invalid days.', ephemeral:true });
    let messageJSON = null;
    const cleaned = messageContent.replace(/^```(json)?/i, '').replace(/```$/,'').trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object') messageJSON = parsed;
      } catch {}
    }
    updatedEv = updateEvent(ev.id, { name, channelId, times, ranges, days, message: messageContent, messageJSON, dynamicBaseContent: messageJSON?.content || messageContent });
    // Auto anchor create/update
    try { await ensureAnchor(interaction, updatedEv, { content: messageJSON?.content || messageContent }); } catch {}
    await interaction.reply({ content: `✅ Event updated${messageJSON? ' (JSON payload detected)':''}.`, ephemeral:true });
  }
  if (managerMessageId && updatedEv) {
    try {
      const mgrMsg = await interaction.channel.messages.fetch(managerMessageId).catch(() => null);
      if (mgrMsg) {
        const isDetail = mgrMsg.components.some(r => r.components.some(c => c.customId === `events_toggle_${updatedEv.id}`));
        if (isDetail) {
          await mgrMsg.edit({ embeds: [buildDetailEmbed(interaction.guild, updatedEv)], components: detailRows(updatedEv) }).catch(() => {});
        } else {
          await mgrMsg.edit({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() }).catch(() => {});
        }
      }
    } catch {}
  }
}

module.exports = { handleScheduleCommand, handleScheduleModal, handleEventCreateModal, handleEventEditModal, ensureAnchor };
