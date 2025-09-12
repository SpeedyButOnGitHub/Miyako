const theme = require('../../utils/theme');
const { createEmbed, safeAddField } = require('../../utils/embeds');
const { buildNavRow, semanticButton } = require('../../ui');
const { config } = require('../../utils/storage');
const { humanizeMinutes, humanizeMs, applyPlaceholdersToJsonPayload, sanitizeMentionsForTesting } = require('./helpers');

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
      let ttlDisp = 'off';
      if (!m.isClockIn) {
        if (hasOwn) ttlDisp = m.deleteAfterMs > 0 ? humanizeMs(m.deleteAfterMs) : 'off';
        else if (config.autoMessages?.defaultDeleteMs > 0) ttlDisp = humanizeMs(config.autoMessages.defaultDeleteMs) + '*';
      }
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
  const opts = (ev.autoMessages||[]).slice(0,25).map(n => ({ label: `${humanizeMinutes(n.offsetMinutes)} ${n.enabled?'(on)':'(off)'} #${n.id}`.slice(0,100), value: n.id, description: (n.messageJSON?.content || n.message || '').replace(/\n/g,' ').slice(0,90) }));
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

async function refreshTrackedAutoMessages(client, ev) {
  try {
    const map = ev.__notifMsgs && typeof ev.__notifMsgs==='object' ? ev.__notifMsgs : null;
    if (map && Array.isArray(ev.autoMessages)) {
      for (const notif of ev.autoMessages) {
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
        // Handle role mentions if present; ensure allowedMentions to avoid accidental mass pings
        if (Array.isArray(notif.mentions) && notif.mentions.length) {
          const mentionLine = notif.mentions.map(r=>`<@&${r}>`).join(' ');
          if (payload.content) payload.content = `${mentionLine}\n${payload.content}`.slice(0,2000);
          else payload.content = mentionLine.slice(0,2000);
          payload.allowedMentions = { roles: notif.mentions.slice(0,20) };
        }
        // Canonical live-content preservation: if the most recent existing message differs from the freshly built
        // payload (indicating a manual/live edit or drift), prefer the live snapshot to avoid reverting on restart.
        try {
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
            if (liveSig !== newSig) {
              // Adopt live content/embeds (but keep allowedMentions we computed if any)
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
          }
        } catch {}
        for (const mid of rec.ids.slice(-3)) {
          try { const msg = await channel.messages.fetch(mid).catch(()=>null); if (msg) await msg.edit(payload).catch(()=>{}); } catch {}
        }
      }
    }
    if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds) && ev.__clockIn.messageIds.length) {
      const chId = ev.__clockIn.channelId || ev.channelId;
      const channel = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
      if (channel && channel.messages) {
        // Hydrate runtime clock-in state explicitly. In some restart scenarios the in-memory
        // merged event passed into this function may not yet include the latest persisted
        // runtime overlay (positions), causing the embed to show *None* for all roles until
        // a user interacts again. We defensively re-load the runtime record and prefer any
        // populated positions from there before rendering.
        let hydrated = ev;
        try {
          const { getRuntime } = require('../../utils/eventsRuntimeLog');
            const rt = getRuntime(ev.id) || {};
            if (rt.__clockIn && rt.__clockIn.positions) {
              // Only overwrite if we actually have at least one registered user recorded.
              const hasAny = Object.values(rt.__clockIn.positions).some(arr => Array.isArray(arr) && arr.length);
              if (hasAny) {
                // Optionally prune users who have left the guild to prevent stale pings.
                try {
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
                    // If pruning changed anything, persist runtime patch
                    const changed = Object.entries(prunedPositions).some(([k,v]) => {
                      const orig = (ev.__clockIn && ev.__clockIn.positions && ev.__clockIn.positions[k]) || [];
                      return Array.isArray(v) && v.length !== orig.length;
                    });
                    if (changed) {
                      try { const { updateEvent } = require('../../utils/eventsStorage'); updateEvent(ev.id, { __clockIn: { ...rt.__clockIn } }); } catch {}
                    }
                  }
                } catch {}
                hydrated = { ...ev, __clockIn: { ...ev.__clockIn, ...rt.__clockIn } };
                try { require('../../utils/logger').debug('[ClockIn Hydrate]', { eventId: ev.id, updated: true }); } catch {}
              } else {
                try { require('../../utils/logger').debug('[ClockIn Hydrate]', { eventId: ev.id, updated: false }); } catch {}
              }
            }
        } catch {}
        const { buildClockInEmbed } = require('../../utils/clockinTemplate');
        const embed = buildClockInEmbed(hydrated);
        for (const mid of ev.__clockIn.messageIds.slice(-3)) {
          try {
            const msg = await channel.messages.fetch(mid).catch(()=>null);
            if (msg) {
              // Rate-limit guard: only edit if embed content changed (compare serialized fields)
              let existingSig = '';
              try {
                const e0 = msg.embeds && msg.embeds[0];
                if (e0) {
                  existingSig = JSON.stringify({
                    title: e0.title,
                    desc: e0.description,
                    fields: (e0.fields||[]).map(f=>({n:f.name,v:f.value})),
                    footer: e0.footer?.text
                  });
                }
              } catch {}
              let nextSig = '';
              try { nextSig = JSON.stringify({ title: embed.title, desc: embed.description, fields: embed.fields, footer: embed.footer?.text }); } catch {}
              if (existingSig !== nextSig) {
                await msg.edit({ content:'', embeds:[embed] }).catch(()=>{});
              }
            }
          } catch {}
        }
      }
    }
  } catch {}
}

module.exports = {
  buildNotifsEmbed,
  notifManagerRows,
  notifSelectRows,
  notifDetailRows,
  refreshTrackedAutoMessages,
};
