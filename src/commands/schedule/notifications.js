const theme = require('../../utils/theme');
const { createEmbed, safeAddField } = require('../../utils/embeds');
const { buildNavRow, semanticButton } = require('../../ui');
const { config } = require('../../utils/storage');
const { updateEvent } = require('../../utils/eventsStorage');
const { humanizeMinutes, humanizeMs, applyPlaceholdersToJsonPayload, sanitizeMentionsForTesting } = require('./helpers');
const { getAll: getPersistedDeletes, setForMessage: persistDeleteForMessage, removeForMessage: removePersistedDelete } = require('../../utils/scheduledDeletes');
const logger = require('../../utils/logger');

function buildNotifsEmbed(guild, ev) {
  const embed = createEmbed({
    title: `${theme.emojis.bell || '🔔'} Auto Messages — ${ev.name}`,
    description: 'Configure automatic messages sent relative to each event time.',
    color: theme.colors.primary
  });
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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
      const hasOwn = Number.isFinite(m.deleteAfterMs);
      // Only display an explicit per-notification TTL; global defaults were removed.
      const ttlDisp = hasOwn ? (m.deleteAfterMs > 0 ? humanizeMs(m.deleteAfterMs) : 'off') : 'off';
      const ttlLabel = ` [TTL ${ttlDisp}]`;
      const mentionNote = Array.isArray(m.mentions) && m.mentions.length ? ` [@${m.mentions.length}]` : '';
      return `${status} [${off}]${clock}${chanNote} ${preview}${ttlLabel}${mentionNote}`;
    }).join('\n');
    safeAddField(embed, 'Messages', lines);
  } else {
    safeAddField(embed, 'Messages', '*None defined yet.*');
  }
  const { applyFooterWithPagination } = require('../../ui');
  applyFooterWithPagination(embed, guild, { page:1, totalPages:1, extra: 'Auto Messages' });
  return embed;
}

function notifManagerRows(ev) {
  const row = buildNavRow([
    semanticButton('success', { id: `event_notif_add_${ev.id}`, label: 'Add', emoji: theme.emojis.create||'➕' }),
    semanticButton('primary', { id: `event_notif_selectmode_${ev.id}`, label: 'Select', emoji: theme.emojis.events||'📋', enabled: !!(ev.autoMessages||[]).length })
  ]);
  return [row];
}

function notifSelectRows(ev) {
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
  const raw = (ev.autoMessages||[]).slice(0,25);
  const opts = raw.map(n => {
    const descRaw = (n.messageJSON?.content || n.message || '').replace(/\n/g,' ').slice(0,90);
    const opt = {
      label: `${humanizeMinutes(n.offsetMinutes)} ${n.enabled ? '(on)' : '(off)'} #${n.id}`.slice(0,100),
      value: n.id
    };
      if (descRaw && descRaw.length) opt.description = descRaw; // Ensure description is set only if not empty
    return opt;
  });
  const row1 = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`event_notif_select_${ev.id}`).setPlaceholder('Select auto message').addOptions(opts));
  return [row1];
}

function notifDetailRows(ev, notif) {
  const row1 = buildNavRow([
    semanticButton(notif.enabled ? 'danger' : 'success', { id: `event_notif_toggle_${ev.id}_${notif.id}`, label: notif.enabled ? 'Disable' : 'Enable', emoji: notif.enabled ? theme.emojis.disable : theme.emojis.enable }),
    semanticButton('primary', { id: `event_notif_edit_${ev.id}_${notif.id}`, label: 'Edit', emoji: theme.emojis.edit || theme.emojis.message || '✏️' })
  ]);
  const row2 = buildNavRow([
    semanticButton('success', { id: `event_notif_trigger_${ev.id}_${notif.id}`, label: 'Trigger', emoji: theme.emojis.enable || '✅' }),
    semanticButton('danger', { id: `event_notif_delete_${ev.id}_${notif.id}`, label: 'Delete', emoji: theme.emojis.delete || '🗑️' })
  ]);
  return [row1, row2];
}

// Map of scheduled delete timers keyed by message id to avoid double-scheduling
const scheduledDeleteTimers = new Map();

function scheduleDeleteForMessage(client, channel, msg, notif, ev) {
  try {
    if (!msg || !msg.id) return;
    // Determine delete TTL. If a notification explicitly sets deleteAfterMs, honor it.
    // Otherwise, do NOT apply the global default TTL to clock-in messages
    // (clock-ins should persist unless explicitly configured).
    // Only schedule deletes when notification explicitly sets deleteAfterMs (>0).
    if (!(notif && Number.isFinite(notif.deleteAfterMs) && Number(notif.deleteAfterMs) > 0)) return;
  const delMs = Number(notif.deleteAfterMs);
  // Attach a correlation id to this scheduled delete so logs can be correlated
  const { newCorrelationId } = require('../../utils/correlation');
  const corrId = newCorrelationId();
  if (scheduledDeleteTimers.has(msg.id)) return;
    const age = Date.now() - (msg.createdTimestamp || Date.now());
    const remaining = delMs - age;
    // If already expired, delete now and persist pruning
    if (remaining <= 0) {
      try { if (channel && channel.messages) channel.messages.delete(msg.id).catch(()=>{}); } catch {}
      try {
        if (ev && ev.id && notif && notif.id) {
          const map = ev.__notifMsgs && typeof ev.__notifMsgs === 'object' ? { ...ev.__notifMsgs } : {};
          const rec = map[notif.id] && typeof map[notif.id] === 'object' ? { ...map[notif.id] } : null;
          if (rec && Array.isArray(rec.ids)) {
            rec.ids = rec.ids.filter(id => id && id !== msg.id);
            map[notif.id] = rec;
            ev.__notifMsgs = map;
          }
          if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds)) ev.__clockIn.messageIds = ev.__clockIn.messageIds.filter(id => id && id !== msg.id);
          updateEvent(ev.id, { __notifMsgs: map, __clockIn: ev.__clockIn });
        }
      } catch {}
      try { removePersistedDelete(msg.id); } catch {}
      try { require('../../utils/logger').info('[scheduleDelete] deleted immediately', { mid: msg.id, eventId: ev && ev.id ? ev.id : null, notifId: notif && notif.id ? notif.id : null, correlationId: corrId }); } catch {}
      return;
    }

    const t = setTimeout(async () => {
      try { scheduledDeleteTimers.delete(msg.id); } catch {}
      try {
        const ch = channel || (client && client.channels ? await client.channels.fetch(msg.channelId).catch(()=>null) : null);
        if (ch && ch.messages) {
          try { require('../../utils/logger').info('[scheduleDelete] deleting message', { mid: msg.id, eventId: ev && ev.id ? ev.id : null, notifId: notif && notif.id ? notif.id : null, correlationId: corrId }); } catch {}
          await ch.messages.delete(msg.id).catch(()=>{});
        }
      } catch {}
      try {
        if (ev && ev.id && notif && notif.id) {
          const map = ev.__notifMsgs && typeof ev.__notifMsgs === 'object' ? { ...ev.__notifMsgs } : {};
          const rec = map[notif.id] && typeof map[notif.id] === 'object' ? { ...map[notif.id] } : null;
          if (rec && Array.isArray(rec.ids)) {
            rec.ids = rec.ids.filter(id => id && id !== msg.id);
            map[notif.id] = rec;
          }
          if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds)) ev.__clockIn.messageIds = ev.__clockIn.messageIds.filter(id => id && id !== msg.id);
          updateEvent(ev.id, { __notifMsgs: map, __clockIn: ev.__clockIn });
        }
      } catch {}
    }, remaining);
    if (typeof t.unref === 'function') t.unref();
    scheduledDeleteTimers.set(msg.id, t);
    try {
    const entry = { eventId: ev && ev.id ? ev.id : null, notifId: notif && notif.id ? notif.id : null, channelId: channel && channel.id ? channel.id : (msg.channelId||null), scheduledAt: Date.now(), deleteAfterMs: delMs, messageCreatedAt: msg.createdTimestamp || Date.now(), correlationId: corrId };
      try { persistDeleteForMessage(msg.id, entry); } catch (e) { logger && logger.warn && logger.warn('[scheduleDelete] persist failed', { err: e && e.message }); }
    } catch (e) { logger && logger.warn && logger.warn('[scheduleDelete] prepare persist failed', { err: e && e.message }); }
  } catch (e) { try { require('../../utils/logger').warn('[scheduleDelete] failed', { err: e && e.message }); } catch{} }
}

async function reconstructScheduledDeletes(client) {
  try {
  const persisted = getPersistedDeletes();
    if (!persisted || typeof persisted !== 'object') return;
    const { getEvent } = require('../../utils/eventsStorage');
    for (const [mid, entry] of Object.entries(persisted)) {
      try {
        const chId = entry.channelId;
        const ch = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
        if (!ch || !ch.messages) continue;
        const msg = await ch.messages.fetch(mid).catch(()=>null);
        if (!msg) continue;
  // Reconstruct notif and event if possible
        let ev = null; let notif = null;
        try { if (entry.eventId) ev = getEvent(entry.eventId); } catch {}
        try { if (ev && ev.autoMessages && entry.notifId) notif = (ev.autoMessages||[]).find(n=>String(n.id)===String(entry.notifId)); } catch {}
        if (!notif) notif = { deleteAfterMs: entry.deleteAfterMs };
        // Schedule using existing helper
        try { scheduleDeleteForMessage(client, ch, msg, notif, ev); } catch {}
      } catch {}
    }
  } catch (e) { try { require('../../utils/logger').warn('[reconstructScheduledDeletes] failed', { err: e && e.message }); } catch{} }

}

async function refreshTrackedAutoMessages(client, ev, options = {}) {
  try {
    const map = ev.__notifMsgs && typeof ev.__notifMsgs==='object' ? ev.__notifMsgs : null;
    if (map && Array.isArray(ev.autoMessages)) {
      for (const notif of ev.autoMessages) {
        if (notif && notif.isClockIn) continue;
        const rec = map[notif.id];
        if (!rec || !rec.channelId || !Array.isArray(rec.ids) || rec.ids.length===0) continue;
        const channel = await client.channels.fetch(rec.channelId).catch(()=>null);
        if (!channel || !channel.messages) continue;
        let payload;
        if (notif.messageJSON && typeof notif.messageJSON==='object') {
          const base = { ...notif.messageJSON };
          if (base.embeds && !Array.isArray(base.embeds)) base.embeds = [base.embeds];
          if (!base.content && !base.embeds) base.content = notif.message || `Auto message (${ev.name})`;
          payload = applyPlaceholdersToJsonPayload(base, ev);
        } else {
          const { applyTimestampPlaceholders } = require('../../utils/timestampPlaceholders');
          let content = notif.message || `Auto message (${ev.name})`;
          content = applyTimestampPlaceholders(content, ev);
          if (config.testingMode) content = sanitizeMentionsForTesting(content);
          payload = { content };
        }
        const mentionLine = Array.isArray(notif.mentions) && notif.mentions.length ? notif.mentions.map(r=>`<@&${r}>`).join(' ') : null;
        if (mentionLine) {
          if (payload.content) payload.content = `${mentionLine}\n${payload.content}`.slice(0,2000);
          else payload.content = mentionLine.slice(0,2000);
          payload.allowedMentions = { roles: notif.mentions.slice(0,20) };
        }

        try {
          const shouldForce = options && (options.forceAll === true || (Array.isArray(options.forceForIds) && options.forceForIds.map(String).includes(String(notif.id))));
          const latestId = rec.ids[rec.ids.length - 1];
          const latestMsg = await channel.messages.fetch(latestId).catch(()=>null);
          if (latestMsg) {
            const liveSig = JSON.stringify({
              c: latestMsg.content || '',
              e: (latestMsg.embeds||[]).map(e=>({ t:e.title, d:e.description, f:(e.fields||[]).map(f=>({n:f.name,v:f.value})) }))
            });
            const newSig = JSON.stringify({
              c: payload.content || '',
              e: (payload.embeds||[]).map(e=>({ t:e.title, d:e.description, f:(e.fields||[]).map(f=>({n:f.name,v:f.value})) }))
            });
            if (!shouldForce && liveSig !== newSig) {
              payload.content = latestMsg.content || payload.content;
              if ((latestMsg.embeds||[]).length) {
                payload.embeds = latestMsg.embeds.map(e=>({
                  title: e.title,
                  description: e.description,
                  color: e.color,
                  footer: e.footer ? { text: e.footer.text } : undefined,
                  fields: (e.fields||[]).map(f=>({ name: f.name, value: f.value, inline: f.inline }))
                })).slice(0,10);
              }
            }
            try {
              if (mentionLine && payload && payload.content && !payload.content.startsWith(mentionLine)) {
                payload.content = `${mentionLine}\n${payload.content}`.slice(0,2000);
                payload.allowedMentions = payload.allowedMentions || { roles: notif.mentions.slice(0,20) };
              }
            } catch {}
          }
        } catch {}

        for (const mid of rec.ids.slice(-3)) {
          try {
            const msg = await channel.messages.fetch(mid).catch(()=>null);
            if (msg) {
              const { retry } = require('../../utils/retry');
              await retry(() => msg.edit(payload), { attempts: 3, baseMs: 50, maxMs: 300 }).catch((e)=>{ try { logger && logger.warn && logger.warn('[notif refresh] edit failed', { err: e?.message, mid, eventId: ev.id }); } catch{} });
              try { scheduleDeleteForMessage(client, channel, msg, notif, ev); } catch {}
            }
          } catch (e) { try { logger && logger.warn && logger.warn('[notif refresh] fetch/edit failed', { err: e.message, mid, eventId: ev.id }); } catch {} }
        }
      }
    }

    // Clock-in messages: collect targets and refresh separately
    if (ev.__clockIn && (Array.isArray(ev.__clockIn.messageIds) && ev.__clockIn.messageIds.length || (ev.__notifMsgs && typeof ev.__notifMsgs === 'object'))) {
      const msgTargets = [];
      try {
        if (Array.isArray(ev.__clockIn.messageIds)) {
          for (const id of ev.__clockIn.messageIds) msgTargets.push({ id, channelId: ev.__clockIn.channelId || ev.channelId });
        }
      } catch {}

      try {
        if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
          for (const [nid, rec] of Object.entries(ev.__notifMsgs)) {
            try {
              // Only include per-notification records that correspond to a clock-in autoMessage
              const auto = (ev.autoMessages||[]).find(a => String(a.id) === String(nid));
              if (!auto || !auto.isClockIn) continue;
              if (rec && Array.isArray(rec.ids)) {
                for (const id of rec.ids) msgTargets.push({ id, channelId: rec.channelId || ev.__clockIn?.channelId || ev.channelId });
              }
            } catch {}
          }
        }
      } catch {}

      const seen = new Set();
      const uniqueTargets = msgTargets.filter(t => { if (!t || !t.id) return false; if (seen.has(t.id)) return false; seen.add(t.id); return true; }).slice(-20);

      for (const t of uniqueTargets) {
        try {
          const chId = t.channelId || ev.__clockIn?.channelId || ev.channelId;
          const channel = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
          if (!channel || !channel.messages) continue;

          let hydrated = ev;
          try {
            const { getRuntime } = require('../../utils/eventsRuntimeLog');
            const rt = getRuntime(ev.id) || {};
            if (rt.__clockIn && rt.__clockIn.positions) {
              const guild = channel.guild;
              if (guild) {
                const prunedPositions = {};
                for (const [role, list] of Object.entries(rt.__clockIn.positions)) {
                  if (!Array.isArray(list)) continue;
                  const filtered = [];
                  for (const uid of list) {
                    const member = guild.members.cache.get(uid);
                    if (member) filtered.push(uid);
                  }
                  prunedPositions[role] = filtered;
                }
                rt.__clockIn.positions = prunedPositions;
                const changed = Object.entries(prunedPositions).some(([k,v]) => {
                  const orig = (ev.__clockIn && ev.__clockIn.positions && ev.__clockIn.positions[k]) || [];
                  return Array.isArray(v) && v.length !== orig.length;
                });
                if (changed) {
                  updateEvent(ev.id, { __clockIn: rt.__clockIn });
                  try { logger && logger.debug && logger.debug('[ClockIn Hydrate]', { eventId: ev.id, updated: true }); } catch {}
                }
                hydrated = { ...ev, __clockIn: { ...ev.__clockIn, positions: rt.__clockIn.positions } };
              }
            }
          } catch {}

          const { buildClockInEmbed } = require('../../utils/clockinTemplate');
          const embed = buildClockInEmbed(hydrated);
          const clkNotif = (ev.autoMessages||[]).find(n=>n.isClockIn) || null;
          let mentionLine = null;
          try { mentionLine = Array.isArray(clkNotif?.mentions) && clkNotif.mentions.length ? clkNotif.mentions.map(r=>`<@&${r}>`).join(' ') : null; } catch {}

          const msg = await channel.messages.fetch(t.id).catch(()=>null);
          if (!msg) continue;
          let existingSig = '';
          try {
            const e0 = msg.embeds && msg.embeds[0];
            if (e0) existingSig = JSON.stringify({ desc: e0.description, fields: (e0.fields||[]).map(f=>({n:f.name,v:f.value})), footer: e0.footer?.text });
          } catch {}
          let nextSig = '';
          try { nextSig = JSON.stringify({ title: embed.title, desc: embed.description, fields: embed.fields, footer: embed.footer?.text }); } catch {}
          if (existingSig !== nextSig) {
            try {
              const { retry } = require('../../utils/retry');
              const content = mentionLine ? `${mentionLine}\n` : '';
              const payload = { content, embeds:[embed] };
              if (mentionLine && Array.isArray(clkNotif?.mentions)) payload.allowedMentions = { roles: clkNotif.mentions.slice(0,20) };
              await retry(() => msg.edit(payload), { attempts: 3, baseMs: 50, maxMs: 300 }).catch((e)=>{ try { logger && logger.warn && logger.warn('[notif refresh] clockin edit failed', { err: e?.message, mid: t.id, eventId: ev.id }); } catch{} });
              try { scheduleDeleteForMessage(client, channel, msg, clkNotif, ev); } catch (e) { logger && logger.warn && logger.warn('[notif refresh] schedule failed', { err: e && e.message }); }
            } catch (e) { try { logger && logger.warn && logger.warn('[notif refresh] clockin edit outer failed', { err: e?.message, mid: t.id, eventId: ev.id }); } catch {} }
          }
        } catch {}
      }
    }
  } catch (e) { try { logger && logger.warn && logger.warn('[refreshTrackedAutoMessages] failed', { err: e?.message }); } catch {} }
}

module.exports = {
  buildNotifsEmbed,
  notifManagerRows,
  notifSelectRows,
  notifDetailRows,
  refreshTrackedAutoMessages,
  scheduleDeleteForMessage,
  reconstructScheduledDeletes,
};
