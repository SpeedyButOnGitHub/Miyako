const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
// Migrated to scheduleService abstraction (removes direct coupling to storage utils)
const { getEvents, getEvent, addEvent, updateEvent, removeEvent } = require("../services/scheduleService");
const { OWNER_ID } = require("./moderation/permissions");
const theme = require("../utils/theme");
const ActiveMenus = require("../utils/activeMenus");
const { applyFooterWithPagination, semanticButton, buildNavRow } = require("../utils/ui");
const { config } = require('../utils/storage');
const { ms } = require('../utils/time');
const { createEmbed, safeAddField } = require('../utils/embeds');

// --- Duration Parsing Helpers ---
// Accept forms:
//  - HH:MM (24h) => concrete time of day
//  - HH:MM-HH:MM => range with start/end
//  - natural duration strings for offsets before event (e.g. 15m, 1h, 2h30m, 90m)
//  - For times field we still keep HH:MM or HH:MM-HH:MM; we extend offsets & editing convenience

function parseOffsetInput(raw) {
  if (!raw) return 0;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'start' || trimmed === '0') return 0;
  // If pure number treat as minutes
  if (/^-?\d+$/.test(trimmed)) return Math.max(0, parseInt(trimmed,10));
  // Replace common words
  let norm = trimmed.replace(/minutes?/g,'m').replace(/hours?/g,'h').replace(/mins?/g,'m').replace(/hrs?/g,'h').replace(/seconds?/g,'s').replace(/secs?/g,'s').replace(/ /g,'');
  // If ends with h and has digits then convert manually if ms() fails
  let durMs = null;
  try { durMs = ms(norm); } catch { durMs = null; }
  if (typeof durMs === 'number' && isFinite(durMs) && durMs >= 0) {
    return Math.round(durMs / 60000); // minutes
  }
  // Support composite like 1h30m by manual parse if ms didn't catch
  const regex = /(\d+)(h|m|s)/g; let match; let totalMs = 0; let any=false;
  while ((match = regex.exec(norm))) {
    any=true; const val = parseInt(match[1],10); const unit = match[2];
    if (unit==='h') totalMs += val*3600000; else if (unit==='m') totalMs += val*60000; else if (unit==='s') totalMs += val*1000;
  }
  if (any) return Math.max(0, Math.round(totalMs/60000));
  return 0; // fallback
}

function humanizeMinutes(mins) {
  if (mins === 0) return 'at start';
  const h = Math.floor(mins/60); const m = mins % 60;
  if (h && m) return `${h}h ${m}m before`;
  if (h) return `${h} hour${h===1?'':'s'} before`;
  return `${m} minute${m===1?'':'s'} before`;
}

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
  const embed = createEmbed({
    title: `${theme.emojis.toggle || '🗓️'} Events Manager`,
    description: evs.length ? evs.map(summarizeEvent).join("\n\n") : "*No events defined yet.*",
    color: theme.colors.primary
  });
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
  const embed = createEmbed({
    title: `${ev.enabled ? theme.emojis.enable : theme.emojis.disable} ${ev.name}`,
    description: ev.description || 'No description provided.',
    color: ev.enabled ? theme.colors.success : theme.colors.danger
  });
  safeAddField(embed, 'Status', ev.enabled ? 'Enabled' : 'Disabled', true);
  safeAddField(embed, 'Type', ev.type || 'multi-daily', true);
  safeAddField(embed, 'Channel', ev.channelId ? `<#${ev.channelId}>` : '(none)', true);
  safeAddField(embed, 'Times', times);
  safeAddField(embed, 'Days', days);
  safeAddField(embed, 'Message', msgPreview);
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: 'Events Manager' });
  return embed;
}

function mainRows() {
  const evs = getEvents();
  // Order: Create, Delete, Select (no Close button per request)
  return [ buildNavRow([
    semanticButton('success', { id: 'events_create', label: 'Create', emoji: theme.emojis.create }),
    semanticButton('danger', { id: 'events_delete_mode', label: 'Delete', emoji: theme.emojis.delete }),
    semanticButton('primary', { id: 'events_select_mode', label: 'Select', emoji: theme.emojis.events, enabled: !!evs.length })
  ]) ];
}

function buildSelectRows(kind) {
  const evs = getEvents();
  const options = evs.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(' ').slice(0,100), emoji: kind === 'delete' ? theme.emojis.delete : (e.enabled?theme.emojis.enable:theme.emojis.disable) }));
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`events_${kind === 'delete' ? 'delete' : 'select'}`).setPlaceholder(kind==='delete'? 'Select event to delete' : 'Select event...').addOptions(options)),
    buildNavRow([
      semanticButton('nav', { id: 'events_back', label: 'Back', emoji: theme.emojis.back })
    ])
  ];
}

function detailRows(ev) {
  // Simplified: Toggle / Edit / Auto Msgs / Delete / Back
  return [ buildNavRow([
    semanticButton(ev.enabled ? 'danger' : 'success', { id: `events_toggle_${ev.id}`, label: ev.enabled ? 'Disable' : 'Enable', emoji: ev.enabled ? theme.emojis.disable : theme.emojis.enable }),
    semanticButton('primary', { id: `events_edit_${ev.id}`, label: 'Edit', emoji: theme.emojis.edit || theme.emojis.message || '✏️' }),
    semanticButton('nav', { id: `events_notifs_${ev.id}`, label: 'Auto Msgs', emoji: theme.emojis.bell || '🔔' }),
    semanticButton('danger', { id: `events_delete_${ev.id}`, label: 'Delete', emoji: theme.emojis.delete }),
    semanticButton('nav', { id: 'events_back', label: 'Back', emoji: theme.emojis.back })
  ]) ];
}

// ---- Automated Messages (per-event) ----

function buildNotifsEmbed(guild, ev) {
  const embed = createEmbed({
    title: `${theme.emojis.bell || '🔔'} Auto Messages — ${ev.name}`,
    description: 'Configure automatic messages sent relative to each event time.',
    color: theme.colors.primary
  });
  safeAddField(embed, 'Event Times', (ev.times||[]).join(', ') || '(none)', true);
  safeAddField(embed, 'Days', (ev.days||[]).map(d=>DAY_NAMES[d]||d).join(', ') || 'All', true);
  safeAddField(embed, 'Total', String((ev.autoMessages||[]).length), true);
  const list = (ev.autoMessages||[]);
  if (list.length) {
    const lines = list.slice(0,15).map(m => {
      const status = m.enabled ? (theme.emojis.enable||'✅') : (theme.emojis.disable||'❌');
      const off = humanizeMinutes(m.offsetMinutes);
      let preview = '';
      if (m.messageJSON) {
        if (m.messageJSON.content) preview = m.messageJSON.content.slice(0,60);
        else if (Array.isArray(m.messageJSON.embeds) && m.messageJSON.embeds.length) preview = (m.messageJSON.embeds[0].title || m.messageJSON.embeds[0].description || '(embed)').toString().slice(0,60);
        else preview = 'JSON';
      } else {
        preview = (m.message||'').replace(/\n/g,' ').slice(0,60) || '(empty)';
      }
      const chanNote = m.channelId && m.channelId !== ev.channelId ? ` <#${m.channelId}>` : '';
      const clock = m.isClockIn ? ' ⏱️' : '';
      return `${status} [${off}]${clock}${chanNote} ${preview}`;
    }).join('\n');
    safeAddField(embed, 'Messages', lines);
  } else {
    safeAddField(embed, 'Messages', '*None defined yet.*');
  }
  applyFooterWithPagination(embed, guild, { page:1, totalPages:1, extra: 'Auto Messages' });
  return embed;
}

function notifManagerRows(ev) {
  return [ buildNavRow([
    semanticButton('success', { id: `event_notif_add_${ev.id}`, label: 'Add', emoji: theme.emojis.create||'➕' }),
    semanticButton('primary', { id: `event_notif_selectmode_${ev.id}`, label: 'Select', emoji: theme.emojis.events||'📋', enabled: !!(ev.autoMessages||[]).length }),
    semanticButton('nav', { id: `event_notif_back_${ev.id}`, label: 'Back', emoji: theme.emojis.back })
  ]) ];
}

function notifSelectRows(ev) {
  const opts = (ev.autoMessages||[]).slice(0,25).map(n => ({ label: `${humanizeMinutes(n.offsetMinutes)} ${n.enabled?'(on)':'(off)'} #${n.id}`.slice(0,100), value: n.id, description: (n.messageJSON?.content || n.message || '').replace(/\n/g,' ').slice(0,90) }));
  const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`event_notif_select_${ev.id}`).setPlaceholder('Select auto message').addOptions(opts));
  const row2 = buildNavRow([
    semanticButton('nav', { id: `event_notif_cancel_${ev.id}`, label: 'Cancel', emoji: theme.emojis.back })
  ]);
  return [row1,row2];
}

// Newly added: detailed auto message control rows
function notifDetailRows(ev, notif) {
  // Row 1: Toggle / Edit (all) / Channel / Offset / Message
  const row1 = buildNavRow([
    semanticButton(notif.enabled ? 'danger' : 'success', { id: `event_notif_toggle_${ev.id}_${notif.id}`, label: notif.enabled ? 'Disable' : 'Enable', emoji: notif.enabled ? theme.emojis.disable : theme.emojis.enable }),
    semanticButton('primary', { id: `event_notif_edit_${ev.id}_${notif.id}`, label: 'Edit', emoji: theme.emojis.edit || theme.emojis.message || '✏️' }),
    semanticButton('nav', { id: `event_notif_edit_channel_${ev.id}_${notif.id}`, label: 'Channel', emoji: theme.emojis.channel || '🧵' }),
    semanticButton('nav', { id: `event_notif_edit_offset_${ev.id}_${notif.id}`, label: 'Offset', emoji: '⏱️' }),
    semanticButton('nav', { id: `event_notif_edit_msg_${ev.id}_${notif.id}`, label: 'Msg', emoji: theme.emojis.message || '💬' })
  ]);
  // Row 2: Trigger / Delete / Back
  const row2 = buildNavRow([
    semanticButton('success', { id: `event_notif_trigger_${ev.id}_${notif.id}`, label: 'Trigger', emoji: theme.emojis.enable || '✅' }),
    semanticButton('danger', { id: `event_notif_delete_${ev.id}_${notif.id}`, label: 'Delete', emoji: theme.emojis.delete || '🗑️' }),
    semanticButton('nav', { id: `event_notif_back_${ev.id}`, label: 'Back', emoji: theme.emojis.back })
  ]);
  return [row1, row2];
}

function buildNotifDetailEmbed(guild, ev, notif) {
  const embed = createEmbed({
    title: `${notif.enabled ? theme.emojis.enable : theme.emojis.disable} Auto Message #${notif.id}`,
    description: `Relative send: **${humanizeMinutes(notif.offsetMinutes)}**\nEvent: **${ev.name}**`,
    color: notif.enabled ? theme.colors.success : theme.colors.danger
  });
  safeAddField(embed, 'Offset', notif.offsetMinutes===0?'0 (start)':`${humanizeMinutes(notif.offsetMinutes)}`, true);
  safeAddField(embed, 'Enabled', notif.enabled? 'Yes':'No', true);
  safeAddField(embed, 'Channel', notif.channelId ? `<#${notif.channelId}>` + (notif.channelId===ev.channelId ? ' (event)' : '') : `<#${ev.channelId}> (event)`, true);
  safeAddField(embed, 'Clock-In', notif.isClockIn ? 'Yes' : 'No', true);
  const previewVal = (()=>{ if (notif.messageJSON){ if (notif.messageJSON.content) return notif.messageJSON.content.slice(0,200)||'(empty)'; if (Array.isArray(notif.messageJSON.embeds)&&notif.messageJSON.embeds.length) return (notif.messageJSON.embeds[0].title||notif.messageJSON.embeds[0].description||'(embed)').toString().slice(0,200); return 'JSON'; } return (notif.message||'').slice(0,200)||'(empty)';})();
  safeAddField(embed, 'Preview', previewVal);
  applyFooterWithPagination(embed, guild, { page:1, totalPages:1, extra:'Auto Msg Detail' });
  return embed;
}

// Helper: create or update anchor message automatically
async function ensureAnchor(interactionOrClient, ev, basePayloadOverride) {
  const client = interactionOrClient.client || interactionOrClient; // support Interaction or Client
  const channel = await client.channels.fetch(ev.channelId).catch(()=>null);
  if (!channel || !channel.send) return null;
  const { applyTimestampPlaceholders } = require('../utils/timestampPlaceholders');
  let baseContent = ev.dynamicBaseContent || (ev.messageJSON?.content) || ev.message || ev.name;
  // Auto-build Midnight Bar template if missing signature header
  if (/Midnight Bar/i.test(ev.name || '') && (!baseContent || !baseContent.includes('⊰-------')) ) {
    const barDivider = '˸'.repeat(54); // decorative line
    baseContent = [
      '# ⊰-------『✩ Midnight Bar :wine_glass: ✩』-------⊱',
      '',
      ' Check our ongoing Instances [here](https://vrchat.com/home/group/grp_d05ea22e-5c38-476e-9884-1cbea50643eb/instances).',
      'We open daily, check the schedule in: https://discord.com/channels/1232701768316620840/1375987053950533722/1406328803227340941.',
      '### :busts_in_silhouette: Looking to apply for staff?',
      'Head over to <#1232701768832516101> and fill out a staff application.',
      'Applying for Staff will get you a spot on the TV as well! ',
      '',
      '### :alarm_clock: Today\'s Opening Times:',
      barDivider,
      '**1st Opening**: timestamp_opening1 - timestamp_closing1',
      barDivider,
      '~~**2nd Opening**: timestamp_opening2 - timestamp_closing2~~',
      barDivider,
      '',
      '### :bell: Want to get notified for this event?',
      'Head over to <#1402656938956689419> and subscribe to the Midnight Bar.',
      'Or simply press the button below to subscribe to get notified.',
      '',
      '[Support us on Patreon! ](https://www.patreon.com/c/lnhvrc) <a:heartsblack:1402694900163809402>',
      '',
      '# The Midnight bar is opening:'
    ].join('\n');
  }
  baseContent = applyTimestampPlaceholders(baseContent, ev);
  if (basePayloadOverride && basePayloadOverride.content) baseContent = basePayloadOverride.content;
  baseContent = applyTimestampPlaceholders(baseContent, ev);
  // Inject initial relative countdown line for Midnight Bar
  try {
    if (/Midnight Bar/i.test(ev.name || '') && /# The Midnight bar is opening:?$/im.test(baseContent)) {
      const { computeNextRange } = require('../utils/timestampPlaceholders');
      const range = computeNextRange(ev);
      if (range) {
        baseContent = baseContent.replace(/# The Midnight bar is opening:?$/im, `# The Midnight bar is opening in <t:${range.startSec}:R>`);
      }
    }
  } catch {}
  const payload = ev.messageJSON ? { ...ev.messageJSON, content: baseContent } : { content: baseContent };
  if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
  // Inject / enforce notification signup button for Midnight Bar
  let expectedButtonId = null;
  try {
    if (/Midnight Bar/i.test(ev.name || '')) {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      expectedButtonId = `event_notify_${ev.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(expectedButtonId)
          .setLabel('Sign up for notifications')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔔')
      );
      payload.components = [row];
      // Ensure image embed attached (only once)
      const imageUrl = 'https://media.discordapp.net/attachments/1385673109486571772/1402700465417883648/The_Midnight_Bar_Event_v1.png?ex=68c1085b&is=68bfb6db&hm=47ea205d83ebe96fee67b47e877093580bde85f5f906d10764cd05b3ab0e15af&=&format=webp&quality=lossless&width=1718&height=350';
      const { EmbedBuilder } = require('discord.js');
      if (!payload.embeds) payload.embeds = [];
      const hasImage = payload.embeds.some(e => (e.data?.image?.url || e.image?.url) === imageUrl);
      if (!hasImage && payload.embeds.length < 10) {
  const { createEmbed } = require('../utils/embeds');
  const imgEmbed = createEmbed({ color: theme.colors.primary }).setImage(imageUrl);
        payload.embeds.push(imgEmbed);
      }
    }
  } catch {}
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
    // Decide if we must edit: content changed, override provided, or required button missing
    let needsEdit = false;
  if (basePayloadOverride || (payload.content && payload.content !== msg.content)) needsEdit = true;
    if (expectedButtonId) {
      const hasButton = Array.isArray(msg.components) && msg.components.some(r => r.components?.some?.(c => c.customId === expectedButtonId));
      if (!hasButton) needsEdit = true;
    }
    if (needsEdit) {
      await msg.edit(payload).catch(()=>{});
    }
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
  if (!name) return interaction.reply({ content: '❌ Name required.', flags:1<<6 }).catch(()=>{});
  if (!/^\d{1,32}$/.test(channelId)) return interaction.reply({ content: '❌ Invalid channel id.', flags:1<<6 }).catch(()=>{});
  const times = timesRaw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
  if (!times.length) return interaction.reply({ content: '❌ Provide times.', flags:1<<6 }).catch(()=>{});
  const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
  const days = daysRaw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
  if (!days.length) return interaction.reply({ content: '❌ Invalid days.', flags:1<<6 }).catch(()=>{});
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
  await interaction.reply({ content: `✅ Event ${ev.name} created with ${ev.times.length} time(s).${jsonNote}`, flags:1<<6 }).catch(()=>{});
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
  await interaction.reply({ content: 'Scheduling system deprecated. Use Events Manager.', flags:1<<6 }).catch(()=>{});
}

// ActiveMenus handler
// Sanitize mentions for testing mode
function sanitizeMentionsForTesting(content) {
  if (!content || typeof content !== 'string') return content;
  return content.replace(/<@&?\d+>/g, m=>`\`${m}\``);
}

async function manualTriggerAutoMessage(interaction, ev, notif) {
  const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
  const targetChannelId = config.testingMode ? CONFIG_LOG_CHANNEL : (notif.channelId || ev.channelId);
  if (!targetChannelId) throw new Error('No channel');
  const channel = await interaction.client.channels.fetch(targetChannelId).catch(()=>null);
  if (!channel) throw new Error('Channel not found');
  const { applyTimestampPlaceholders } = require('../utils/timestampPlaceholders');
  if (notif.isClockIn) {
    // Build a minimal clock-in message (doesn't alter state beyond skip marker when not testing)
  const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
  const theme = require('../utils/theme');
    const POSITIONS = [
      { key:'instance_manager', label:'🗝️ Instance Manager', max:1 },
      { key:'manager', label:'🛠️ Manager', max:5 },
      { key:'bouncer', label:'🛡️ Bouncer', max:10 },
      { key:'bartender', label:'🍸 Bartender', max:15 },
      { key:'backup', label:'🎯 Backup', max:20 },
      { key:'maybe', label:'⏳ Maybe/Late', max:50 }
    ];
    ev.__clockIn = ev.__clockIn || { positions:{}, messageIds:[] };
    for (const p of POSITIONS) { if (!Array.isArray(ev.__clockIn.positions[p.key])) ev.__clockIn.positions[p.key] = []; }
  // Enforce standardized staff clock-in header (ignore saved custom message)
  let baseText = `🕒 Staff Clock-In — ${ev.name}`;
    baseText = applyTimestampPlaceholders(baseText, ev).replace(/\n{3,}/g,'\n\n');
    if (config.testingMode) baseText = sanitizeMentionsForTesting(baseText);
    const embed = new EmbedBuilder()
      .setTitle(`🕒 Staff Clock-In — ${ev.name}`)
      .setColor(theme.colors?.primary || 0x5865F2)
      .setDescription(`${baseText}\n\nSelect a position below. One slot per staff; selecting moves you.`);
    for (const p of POSITIONS) {
      const arr = ev.__clockIn.positions[p.key];
      const value = arr.length ? arr.map(id=>`<@${id}>`).join(', ') : '—';
      embed.addFields({ name: `${p.label} (${arr.length}/${p.max})`, value: value.substring(0,1024), inline: true });
    }
    const menu = new StringSelectMenuBuilder().setCustomId(`clockin:${ev.id}:${notif.id}`).setPlaceholder('📋 Select a position').addOptions(POSITIONS.map(p=>({ label: p.label.replace(/^\S+\s+/,'').slice(0,100), value:p.key })));
    const row = new ActionRowBuilder().addComponents(menu);
    const sent = await channel.send({ embeds:[embed], components:[row] }).catch(()=>null);
    if (sent && !config.testingMode) {
      notif.__skipUntil = Date.now() + 60*60*1000; // skip for an hour
      notif.lastManualTrigger = Date.now();
      updateEvent(ev.id, { autoMessages: ev.autoMessages });
    }
    return !!sent;
  }
  let content = notif.messageJSON?.content || notif.message || '';
  if (!content && notif.messageJSON) content = '';
  content = applyTimestampPlaceholders(content, ev);
  if (config.testingMode) content = sanitizeMentionsForTesting(content);
  if (!content) content = `Auto message (${ev.name})`;
  const payload = notif.messageJSON ? { ...notif.messageJSON, content } : { content };
  if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
  const sent = await channel.send(payload).catch(()=>null);
  if (sent && !config.testingMode) {
    notif.__skipUntil = Date.now() + 60*60*1000;
    notif.lastManualTrigger = Date.now();
    updateEvent(ev.id, { autoMessages: ev.autoMessages });
  }
  return !!sent;
}

ActiveMenus.registerHandler('events', async (interaction, session) => {
  if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: 'Not for you.', flags: 1<<6 });
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
  const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const updated = updateEvent(id, { enabled: !ev.enabled });
    await interaction.update({ embeds: [buildDetailEmbed(interaction.guild, updated)], components: detailRows(updated) });
    return;
  }
  if (customId.startsWith('events_edit_times_')) {
    const id = customId.split('_').pop();
  const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const modal = new ModalBuilder().setCustomId(`event_times_modal_${id}_${interaction.message.id}`).setTitle('Edit Times')
  .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('times').setLabel('Times (HH:MM or HH:MM-HH:MM, comma)').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue((ev.times||[]).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_days_')) {
    const id = customId.split('_').pop();
  const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const modal = new ModalBuilder().setCustomId(`event_days_modal_${id}_${interaction.message.id}`).setTitle('Edit Days')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('days').setLabel('Days (Sun,Mon,...)').setStyle(TextInputStyle.Short).setRequired(true).setValue((ev.days||[]).map(d=>DAY_NAMES[d]||d).join(','))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('events_edit_msg_')) {
    const id = customId.split('_').pop();
  const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    const modal = new ModalBuilder().setCustomId(`event_msg_modal_${id}_${interaction.message.id}`).setTitle('Edit Message')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message Content').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(ev.message || '')));
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
    const modal = new ModalBuilder().setCustomId(`notif_edit_modal_${evId}_${notifId}_${interaction.message.id}`).setTitle('Edit Auto Message')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID (blank=event)').setStyle(TextInputStyle.Short).setRequired(false).setValue(notif.channelId||'')),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('offset').setLabel('When before start? (e.g. 10m, 2h)').setStyle(TextInputStyle.Short).setRequired(true).setValue(notif.offsetMinutes? `${notif.offsetMinutes}m` : 'start')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message / JSON').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(notif.message || (notif.messageJSON? JSON.stringify(notif.messageJSON,null,2):'')))
      );
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('event_notif_edit_channel_')) {
    const parts = customId.split('_');
    const evId = parts[4]; const notifId = parts[5];
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
  if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const modal = new ModalBuilder().setCustomId(`notif_channel_modal_${evId}_${notifId}_${interaction.message.id}`).setTitle('Edit Channel')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel').setLabel('Channel ID (blank=event)').setStyle(TextInputStyle.Short).setRequired(false).setValue(notif.channelId||'')));
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
    await interaction.update({ embeds:[buildNotifDetailEmbed(interaction.guild, getEvent(evId), list[idx])], components: notifDetailRows(ev, list[idx]) });
    return;
  }
  if (customId.startsWith('event_notif_clockin_')) {
  // Removed: legacy clock-in toggle disabled
  return interaction.reply({ content:'Clock-In toggle removed. To designate a clock-in message, set isClockIn in data manually if still needed.', flags:1<<6 }).catch(()=>{});
  }
  if (customId.startsWith('event_notif_trigger_')) {
    const parts = customId.split('_');
    const evId = parts[3]; const notifId = parts[4];
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
  if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    try {
      const sentOk = await manualTriggerAutoMessage(interaction, ev, notif);
      if (sentOk) {
  await interaction.reply({ content: `✅ Triggered auto message #${notif.id}${config.testingMode?' (testing mode output only)':''}.`, flags:1<<6 }).catch(()=>{});
      } else {
  await interaction.reply({ content: '❌ Failed to send message.', flags:1<<6 }).catch(()=>{});
      }
    } catch (e) {
  await interaction.reply({ content: '❌ Error: '+(e.message||e), flags:1<<6 }).catch(()=>{});
    }
    return;
  }
  if (customId.startsWith('event_notif_edit_offset_')) {
    const parts = customId.split('_');
    const evId = parts[4]; const notifId = parts[5];
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
  if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const modal = new ModalBuilder().setCustomId(`notif_offset_modal_${evId}_${notifId}_${interaction.message.id}`).setTitle('Edit Offset')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('offset').setLabel('Minutes BEFORE (0=start)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(notif.offsetMinutes||0))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('event_notif_edit_msg_')) {
    const parts = customId.split('_');
    const evId = parts[4]; const notifId = parts[5];
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
  if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const modal = new ModalBuilder().setCustomId(`notif_msg_modal_${evId}_${notifId}_${interaction.message.id}`).setTitle('Edit Auto Message')
      .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message / JSON').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(notif.message || (notif.messageJSON? JSON.stringify(notif.messageJSON,null,2):''))));
    await interaction.showModal(modal); return;
  }
  if (customId.startsWith('event_notif_delete_')) {
    const parts = customId.split('_');
    const evId = parts[4]; const notifId = parts[5];
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
    const list = (ev.autoMessages||[]).filter(n=>String(n.id)!==String(notifId));
    updateEvent(ev.id, { autoMessages: list });
    await interaction.update({ embeds:[buildNotifsEmbed(interaction.guild, getEvent(evId))], components: notifManagerRows(getEvent(evId)) });
    return;
  }
  if (customId.startsWith('events_delete_')) {
    const id = customId.split('_').pop();
  const ev = getEvent(id); if (!ev) return interaction.reply({ content: 'Missing event.', flags: 1<<6 });
    removeEvent(id);
    data.mode = 'main'; data.currentId = null;
    await interaction.update({ embeds: [buildMainEmbed(interaction.guild)], components: mainRows() });
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

  // Select menus
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
    if (customId.startsWith('event_notif_select_')) {
      const evId = customId.split('_').pop();
  const ev = getEvent(evId); if (!ev) return interaction.reply({ content:'Missing event.', flags:1<<6 });
      const notifId = interaction.values[0];
      const notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(notifId));
  if (!notif) return interaction.reply({ content:'Not found.', flags:1<<6 });
      await interaction.update({ embeds:[buildNotifDetailEmbed(interaction.guild, ev, notif)], components: notifDetailRows(ev, notif) });
      return;
    }
  }
});

async function handleEventEditModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^event_(times|days|msg|edit)_modal_/.test(interaction.customId)) return;
  // Notification modals handled separately below
  // pattern: event_<kind>_modal_<eventId>[_<managerMessageId>]
  const parts = interaction.customId.split("_");
  const eventId = parts[3];
  const managerMessageId = parts[4] || null;
  if (!/^\d+$/.test(eventId)) { await interaction.reply({ content: '❌ Bad event id.', flags: 1<<6 }).catch(()=>{}); return; }
  const ev = getEvent(eventId);
  if (!ev) { await interaction.reply({ content: "Event not found.", flags:1<<6 }); return; }
  let updatedEv = null;
  if (interaction.customId.startsWith("event_times_modal_")) {
    const raw = interaction.fields.getTextInputValue("times");
    const times = raw.split(/[\,\s]+/).map(t=>t.trim()).filter(Boolean);
  const ranges = times.map(t => t.includes('-') ? (()=>{ const [s,e]=t.split('-').map(x=>x.trim()); return { start:s, end:e };})() : null).filter(Boolean);
  if (!times.length) { await interaction.reply({ content: "❌ Provide times.", flags:1<<6 }); return; }
  updatedEv = updateEvent(ev.id, { times, ranges });
  await interaction.reply({ content: "✅ Times updated.", flags:1<<6 });
  } else if (interaction.customId.startsWith("event_days_modal_")) {
    const raw = interaction.fields.getTextInputValue("days");
    const dayMap = { sun:0, sunday:0, mon:1, monday:1, tue:2, tuesday:2, wed:3, wednesday:3, thu:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
    const days = raw.split(/[\,\s]+/).map(d=>d.trim().toLowerCase()).filter(Boolean).map(d=>dayMap[d]).filter(d=>d!==undefined);
  if (!days.length) { await interaction.reply({ content: "❌ Invalid days.", flags:1<<6 }); return; }
    updatedEv = updateEvent(ev.id, { days });
  await interaction.reply({ content: "✅ Days updated.", flags:1<<6 });
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
  await interaction.reply({ content: `✅ Message updated${messageJSON ? ' (JSON payload detected)' : ''}.`, flags:1<<6 });
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
  if (!name) return interaction.reply({ content: '❌ Name required.', flags:1<<6 });
  if (!/^\d{1,32}$/.test(channelId)) return interaction.reply({ content: '❌ Invalid channel id.', flags:1<<6 });
  if (!times.length) return interaction.reply({ content: '❌ Provide times.', flags:1<<6 });
  if (!days.length) return interaction.reply({ content: '❌ Invalid days.', flags:1<<6 });
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
  await interaction.reply({ content: `✅ Event updated${messageJSON? ' (JSON payload detected)':''}.`, flags:1<<6 });
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

async function handleEventNotificationModal(interaction) {
  if (!interaction.isModalSubmit()) return;
  if (!/^(notif_(add|offset|msg|channel|edit)_modal_)/.test(interaction.customId)) return;
  const parts = interaction.customId.split('_');
  // Patterns:
  // notif_add_modal_<eventId>_<managerMessageId>
  // notif_offset_modal_<eventId>_<notifId>_<managerMessageId>
  // notif_msg_modal_<eventId>_<notifId>_<managerMessageId>
  // notif_channel_modal_<eventId>_<notifId>_<managerMessageId>
  // notif_edit_modal_<eventId>_<notifId>_<managerMessageId>
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
    let offset = parseOffsetInput(offsetRaw);
    const msgRaw = interaction.fields.getTextInputValue('message');
    const chanRaw = (interaction.fields.getTextInputValue('channel')||'').trim();
    let msgChannelId = chanRaw.replace(/[<#>]/g,'');
  if (msgChannelId && !/^\d{1,32}$/.test(msgChannelId)) { return interaction.reply({ content:'❌ Invalid channel id.', flags:1<<6 }).catch(()=>{}); }
    let messageJSON = null;
    const healed = healJSON(msgRaw);
    if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const nextId = String(ev.nextAutoId || 1);
    const entry = { id: nextId, offsetMinutes: offset, enabled: true, message: msgRaw, messageJSON };
    if (msgChannelId) entry.channelId = msgChannelId;
    list.push(entry);
    updatedEv = updateEvent(ev.id, { autoMessages: list, nextAutoId: Number(nextId)+1 });
  await interaction.reply({ content:`✅ Auto message #${nextId} created${messageJSON?' (JSON)':''}.`, flags:1<<6 }).catch(()=>{});
  } else if (kind==='offset') {
    const offsetRaw = interaction.fields.getTextInputValue('offset');
    let offset = parseOffsetInput(offsetRaw);
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
  if (idx===-1) return interaction.reply({ content:'Not found.', flags:1<<6 });
    list[idx].offsetMinutes = offset;
    updatedEv = updateEvent(ev.id, { autoMessages: list });
  await interaction.reply({ content:`✅ Offset updated.`, flags:1<<6 }).catch(()=>{});
  } else if (kind==='msg') {
    const msgRaw = interaction.fields.getTextInputValue('message');
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
  if (idx===-1) return interaction.reply({ content:'Not found.', flags:1<<6 });
    let messageJSON = null; const healed = healJSON(msgRaw); if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    list[idx].message = msgRaw; list[idx].messageJSON = messageJSON;
    updatedEv = updateEvent(ev.id, { autoMessages: list });
  await interaction.reply({ content:`✅ Message updated${messageJSON?' (JSON)':''}.`, flags:1<<6 }).catch(()=>{});
  } else if (kind==='channel') {
    const chanRaw = (interaction.fields.getTextInputValue('channel')||'').trim();
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
  if (idx===-1) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const cleaned = chanRaw.replace(/[<#>]/g,'');
  if (cleaned && !/^\d{1,32}$/.test(cleaned)) return interaction.reply({ content:'❌ Invalid channel id.', flags:1<<6 });
    if (cleaned) list[idx].channelId = cleaned; else delete list[idx].channelId;
    updatedEv = updateEvent(ev.id, { autoMessages: list });
  await interaction.reply({ content:`✅ Channel ${cleaned? 'updated':'reset to event channel'}.`, flags:1<<6 }).catch(()=>{});
  } else if (kind==='edit') {
    const list = Array.isArray(ev.autoMessages)? [...ev.autoMessages]:[];
    const idx = list.findIndex(n=>String(n.id)===String(notifId));
  if (idx===-1) return interaction.reply({ content:'Not found.', flags:1<<6 });
    const chanRaw = (interaction.fields.getTextInputValue('channel')||'').trim();
    const cleanedChan = chanRaw.replace(/[<#>]/g,'');
  if (cleanedChan && !/^\d{1,32}$/.test(cleanedChan)) return interaction.reply({ content:'❌ Invalid channel id.', flags:1<<6 });
    const offsetRaw = interaction.fields.getTextInputValue('offset');
    let offset = parseOffsetInput(offsetRaw);
    const msgRaw = interaction.fields.getTextInputValue('message');
    let messageJSON = null; const healed = healJSON(msgRaw); if (healed.startsWith('{') && healed.endsWith('}')) { try { const parsed = JSON.parse(healed); if (parsed && typeof parsed==='object') messageJSON = parsed; } catch {} }
    const entry = list[idx];
    entry.offsetMinutes = offset;
    entry.message = msgRaw;
    entry.messageJSON = messageJSON;
    if (cleanedChan) entry.channelId = cleanedChan; else delete entry.channelId;
    updatedEv = updateEvent(ev.id, { autoMessages: list });
  await interaction.reply({ content:`✅ Auto message updated.`, flags:1<<6 }).catch(()=>{});
  }
  if (managerMessageId && updatedEv) {
    try {
      const channel = interaction.channel;
      const mgrMsg = await channel.messages.fetch(managerMessageId).catch(()=>null);
      if (mgrMsg) {
        // Determine whether we are in notifs manager or detail or event detail
        if (mgrMsg.components.some(r=>r.components.some(c=>c.customId?.startsWith('event_notif_')))) {
          // refresh auto msgs manager
          await mgrMsg.edit({ embeds:[buildNotifsEmbed(interaction.guild, updatedEv)], components: notifManagerRows(updatedEv) }).catch(()=>{});
        } else if (mgrMsg.components.some(r=>r.components.some(c=>c.customId===`events_toggle_${updatedEv.id}`))) {
          await mgrMsg.edit({ embeds:[buildDetailEmbed(interaction.guild, updatedEv)], components: detailRows(updatedEv) }).catch(() => {});
        }
      }
    } catch {}
  }
}

module.exports = { handleScheduleCommand, handleScheduleModal, handleEventCreateModal, handleEventEditModal, handleEventNotificationModal, ensureAnchor, manualTriggerAutoMessage };
