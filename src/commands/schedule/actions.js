const theme = require('../../utils/theme');
const { config } = require('../../utils/storage');
const { updateEvent } = require('../../utils/eventsStorage');
const { applyEventName, applyPlaceholdersToJsonPayload, sanitizeMentionsForTesting } = require('./helpers');

async function ensureAnchor(interactionOrClient, ev, basePayloadOverride) {
  const client = interactionOrClient.client || interactionOrClient;
  const channel = await client.channels.fetch(ev.channelId).catch(()=>null);
  if (!channel || !channel.send) return null;
  const { applyTimestampPlaceholders } = require('../../utils/timestampPlaceholders');
  let baseContent = ev.dynamicBaseContent || (ev.messageJSON?.content) || ev.message || ev.name;
  baseContent = applyEventName(baseContent, ev);
  if (/Midnight Bar/i.test(ev.name || '') && (!baseContent || !/Midnight Bar/i.test(baseContent))) {
    const barDivider = '─'.repeat(36);
    baseContent = [
      '## ✩ Midnight Bar ✩',
      '',
      'Check our ongoing instances [here](https://vrchat.com/home/group/grp_d05ea22e-5c38-476e-9884-1cbea50643eb/instances).',
      'We open daily; see the schedule channel for full details.',
      '',
      "### 🕒 Today's Opening Times",
      barDivider,
      '**First Opening:** timestamp_opening1 — timestamp_closing1',
      '~~Second Opening: timestamp_opening2 — timestamp_closing2~~',
      barDivider,
      '',
      '### 🔔 Notifications',
      'Use the subscribe button below to get notified when we open.',
      '',
      '### ❤️ Support',
      '[Support us on Patreon](https://www.patreon.com/c/lnhvrc)'
    ].join('\n');
  }
  baseContent = applyTimestampPlaceholders(baseContent, ev);
  baseContent = applyEventName(baseContent, ev);
  if (basePayloadOverride && basePayloadOverride.content) baseContent = basePayloadOverride.content;
  baseContent = applyTimestampPlaceholders(baseContent, ev);
  try {
    if (/Midnight Bar/i.test(ev.name || '') && /# The Midnight bar is opening:?$/im.test(baseContent)) {
      const { computeNextRange } = require('../../utils/timestampPlaceholders');
      const range = computeNextRange(ev);
      if (range) baseContent = baseContent.replace(/# The Midnight bar is opening:?$/im, `# The Midnight bar is opening in <t:${range.startSec}:R>`);
    }
  } catch {}
  const payload = ev.messageJSON ? { ...ev.messageJSON, content: baseContent } : { content: baseContent };
  if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
  let expectedButtonId = null;
  try {
    if (/Midnight Bar/i.test(ev.name || '')) {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      expectedButtonId = `event_notify_${ev.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(expectedButtonId).setLabel('Notify Me').setStyle(ButtonStyle.Primary).setEmoji('🔔')
      );
      payload.components = [row];
      const imageUrl = 'https://media.discordapp.net/attachments/1385673109486571772/1402700465417883648/The_Midnight_Bar_Event_v1.png?ex=68c1085b&is=68bfb6db&hm=47ea205d83ebe96fee67b47e877093580bde85f5f906d10764cd05b3ab0e15af&=&format=webp&quality=lossless&width=1718&height=350';
      const { createEmbed } = require('../../utils/embeds');
      if (!payload.embeds) payload.embeds = [];
      const hasImage = payload.embeds.some(e => (e.data?.image?.url || e.image?.url) === imageUrl);
      if (!hasImage && payload.embeds.length < 10) {
        const imgEmbed = createEmbed({ color: theme.colors.primary }).setImage(imageUrl);
        payload.embeds.push(imgEmbed);
      }
    }
  } catch {}
  let msg = null;
  if (ev.anchorMessageId) msg = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
  if (!msg) {
    msg = await channel.send(payload).catch(()=>null);
    if (msg) updateEvent(ev.id, { anchorChannelId: channel.id, anchorMessageId: msg.id, dynamicBaseContent: baseContent });
  } else {
    let needsEdit = false;
    if (basePayloadOverride || (payload.content && payload.content !== msg.content)) needsEdit = true;
    if (expectedButtonId) {
      const hasButton = Array.isArray(msg.components) && msg.components.some(r => r.components?.some?.(c => c.customId === expectedButtonId));
      if (!hasButton) needsEdit = true;
    }
    if (needsEdit) await msg.edit(payload).catch(()=>{});
    if (!ev.dynamicBaseContent) updateEvent(ev.id, { dynamicBaseContent: baseContent });
  }
  return msg;
}

async function manualTriggerAutoMessage(interaction, ev, notif) {
  try {
    const { getEvent } = require('../../utils/eventsStorage');
    const fresh = getEvent(ev.id) || null;
    if (fresh) {
      // merge channelId from original in-memory event if storage sanitized it out
      if (!fresh.channelId && ev.channelId) fresh.channelId = ev.channelId;
      ev = fresh;
    }
  } catch {}
  const { CONFIG_LOG_CHANNEL } = require('../../utils/logChannels');
  const { applyTimestampPlaceholders } = require('../../utils/timestampPlaceholders');
  let targetChannelId = config.testingMode ? CONFIG_LOG_CHANNEL : (notif.channelId || ev.channelId);
  // Fallback to interaction's channel when notif/ev lack a channel (useful for tests and some interactions)
  if (!targetChannelId && interaction) targetChannelId = interaction.channelId || (interaction.channel && interaction.channel.id) || null;
  if (!targetChannelId) throw new Error('No channel');
  const channel = await interaction.client.channels.fetch(targetChannelId).catch(()=>null);
  if (!channel) throw new Error('Channel not found');
  try {
    const { seenRecently } = require('../../utils/sendOnce');
    const key = `manual:${ev.id}:${notif.id}:${targetChannelId}`;
    if (seenRecently(key, 7000)) return true;
  } catch {}
  if (notif.isClockIn) {
    const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
    const POSITIONS = [
      { key:'instance_manager', emoji:'🗝️', label:'Instance Manager', cap:1, short:'IM' },
      { key:'manager',          emoji:'🛠️', label:'Manager',          cap:5, short:'M' },
      { key:'bouncer',          emoji:'🛡️', label:'Bouncer',          cap:10, short:'B' },
      { key:'bartender',        emoji:'🍸', label:'Bartender',        cap:15, short:'BT' },
      { key:'backup',           emoji:'🎯', label:'Backup',           cap:20, short:'BK' },
      { key:'maybe',            emoji:'⏳', label:'Maybe/Late',        cap:50, short:'?' }
    ];
    ev.__clockIn = ev.__clockIn || { positions:{}, messageIds:[] };
    for (const p of POSITIONS) { if (!Array.isArray(ev.__clockIn.positions[p.key])) ev.__clockIn.positions[p.key] = []; }
    try {
      const DEDUP_MS = 5 * 60 * 1000;
      if (ev.__clockIn.lastSentTs && (Date.now() - ev.__clockIn.lastSentTs) < DEDUP_MS) {
        notif.__skipUntil = Date.now() + 60*60*1000;
        notif.lastManualTrigger = Date.now();
        updateEvent(ev.id, { autoMessages: ev.autoMessages, __clockIn: ev.__clockIn });
        return true;
      }
    } catch {}
    const fmtMentions = (arr=[]) => {
      if (!Array.isArray(arr) || arr.length === 0) return '*None*';
      const s = arr.map(id=>`<@${id}>`).join(', ');
      return config.testingMode ? s.replace(/<@&?\d+>/g, m=>`\`${m}\``) : s;
    };
    const nameSafe = ev.name || 'Event';

    // Build positions to display; in testing mode seed up to 5 random users per role (IM max 1).
    let displayPositions = { ...ev.__clockIn.positions };
    try {
      if (config.testingMode && interaction.guild) {
        const guild = interaction.guild;
        // Try to have some member IDs, avoid heavy fetch if cache is sufficient
        let membs = guild.members?.cache?.filter(m => !m.user?.bot)?.map(m => m.id) || [];
        if (!membs || membs.length < 10) {
          try {
            const fetched = await guild.members.fetch({ time: 5000 }).catch(() => null);
            if (fetched) membs = fetched.filter(m => !m.user?.bot).map(m => m.id);
          } catch {}
        }
        const sample = (arr, n) => {
          const out = [];
          const pool = Array.isArray(arr) ? [...arr] : [];
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          for (let i=0; i<Math.min(n, pool.length); i++) out.push(pool[i]);
          return out;
        };
        const ensure = (key, cap) => {
          const current = Array.isArray(displayPositions[key]) ? [...displayPositions[key]] : [];
          const maxFill = Math.min(cap ?? 5, 5);
          const need = Math.max(0, maxFill - current.length);
          if (need > 0 && membs && membs.length) {
            const add = sample(membs, need);
            // avoid duplicates
            for (const id of add) if (!current.includes(id)) current.push(id);
          }
          if (Number.isFinite(cap)) {
            while (current.length > cap) current.pop();
          }
          displayPositions[key] = current;
        };
        ensure('instance_manager', 1);
        ensure('manager');
        ensure('bouncer');
        ensure('bartender');
        ensure('backup');
        ensure('maybe');
      }
    } catch {}

    // Apply any autoNext entries into the display-only positions so the preview shows those
    // but DO NOT consume or persist them here; consumption/persistence happens below when we prepare
    // the fresh persisted positions for the new clock-in.
    try {
      try {
        ev.__clockIn = ev.__clockIn || { positions: {}, messageIds: [], autoNext: {} };
        ev.__clockIn.autoNext = ev.__clockIn.autoNext && typeof ev.__clockIn.autoNext === 'object' ? ev.__clockIn.autoNext : {};
        const autoNextEntries = Object.entries(ev.__clockIn.autoNext);
        if (autoNextEntries.length) {
          for (const [userId, roleKey] of autoNextEntries) {
            if (!roleKey || !displayPositions[roleKey]) continue;
            const meta = POSITIONS.find(p=>p.key===roleKey);
            const cap = meta ? meta.cap : 9999;
            const arr = displayPositions[roleKey];
            if (!arr.includes(userId) && arr.length < cap) arr.push(userId);
          }
        }
      } catch {}
    } catch {}

    // Prepare fresh persisted positions for this new clock-in: clear existing persisted positions first
    try {
      ev.__clockIn = ev.__clockIn || { positions: {}, messageIds: [], autoNext: {} };
      if (!ev.__clockIn.positions || typeof ev.__clockIn.positions !== 'object') ev.__clockIn.positions = {};
  // Ensure keys exist for all POSITIONS and clear existing persisted selections
  for (const p of POSITIONS) { ev.__clockIn.positions[p.key] = []; }
      // Now apply any existing autoNext entries into the fresh positions so they become persisted registrations
      try {
        ev.__clockIn.autoNext = ev.__clockIn.autoNext && typeof ev.__clockIn.autoNext === 'object' ? ev.__clockIn.autoNext : {};
        const entries = Object.entries(ev.__clockIn.autoNext);
        if (entries.length) {
          for (const [userId, roleKeyRaw] of entries) {
            const roleKey = typeof roleKeyRaw === 'string' ? roleKeyRaw : (roleKeyRaw && roleKeyRaw.role) || null;
            if (!roleKey || !ev.__clockIn.positions[roleKey]) { delete ev.__clockIn.autoNext[userId]; continue; }
            const meta = POSITIONS.find(p=>p.key===roleKey);
            const cap = meta ? meta.cap : 9999;
            const arr = ev.__clockIn.positions[roleKey];
            if (!arr.includes(userId) && arr.length < cap) arr.push(userId);
            // consume the autoNext entry (one-shot)
            delete ev.__clockIn.autoNext[userId];
          }
          // persist the newly populated positions and cleared autoNext
          try { updateEvent(ev.id, { autoMessages: ev.autoMessages, __clockIn: ev.__clockIn }); } catch {}
        }
      } catch {}
    } catch {}

    const embedJson = {
      title: `🕒 Staff Clock In — ${nameSafe}`,
      description: "Please select your role below to clock in.\n\n**Instance Manager** is responsible for opening, managing and closing an instance.",
      color: 3447003,
      fields: [
        { name: '📝 Instance Manager (1 slot)', value: `${(displayPositions.instance_manager||[]).length} / 1\n${fmtMentions(displayPositions.instance_manager)}`, inline: false },
        { name: '🛠️ Manager',   value: fmtMentions(displayPositions.manager),   inline: true },
        { name: '🛡️ Bouncer',   value: fmtMentions(displayPositions.bouncer),   inline: true },
        { name: '🍸 Bartender', value: fmtMentions(displayPositions.bartender), inline: true },
        { name: '🎯 Backup',    value: fmtMentions(displayPositions.backup),    inline: true },
        { name: '⏳ Maybe / Late', value: fmtMentions(displayPositions.maybe), inline: false },
        { name: 'Eligible roles', value: '<@&1375995842858582096>, <@&1380277718091829368>, <@&1380323145621180466>, <@&1375958480380493844>' }
      ],
      footer: { text: `Late Night Hours | Staff clock in for ${nameSafe}` }
    };
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`clockin:${ev.id}:${notif.id}`)
      .setPlaceholder('📋 Select your position')
      .addOptions([
        { label: 'Instance Manager', value: 'instance_manager', description: '1 slot available', emoji: { name: '📝' } },
        { label: 'Manager',          value: 'manager',                              emoji: { name: '🛠️' } },
        { label: 'Bouncer',          value: 'bouncer',                              emoji: { name: '🛡️' } },
        { label: 'Bartender',        value: 'bartender',                            emoji: { name: '🍸' } },
        { label: 'Backup',           value: 'backup',                               emoji: { name: '🎯' } },
        { label: 'Maybe / Late',     value: 'maybe',                                emoji: { name: '⏳' } },
        { label: 'Unregister / Clear', value: 'none',                               emoji: { name: '🚫' } }
      ]);
    const row = new ActionRowBuilder().addComponents(menu);
    const sent = await channel.send({ content: '', embeds:[embedJson], components:[row] }).catch(()=>null);
    if (sent && !config.testingMode) {
      // Backoff future auto-triggers and persist clock-in context
      notif.__skipUntil = Date.now() + 60*60*1000;
      notif.lastManualTrigger = Date.now();
      ev.__clockIn.lastSentTs = Date.now();
      ev.__clockIn.channelId = channel.id;
      // Track the message ID so interaction fallback can resolve the event by message
      if (!Array.isArray(ev.__clockIn.messageIds)) ev.__clockIn.messageIds = [];
      ev.__clockIn.messageIds.push(sent.id);
      // Keep only the latest message id in persisted record; delete previous ones (best-effort)
      if (ev.__clockIn.messageIds.length > 1) {
        const older = ev.__clockIn.messageIds.slice(0, -1);
        ev.__clockIn.messageIds = ev.__clockIn.messageIds.slice(-1);
        (async () => {
          try {
            const ch = channel;
            const { retry } = require('../../utils/retry');
            for (const mid of older) {
              try {
                const m = await ch.messages.fetch(mid).catch(()=>null);
                if (m) await retry(() => m.delete(), { attempts: 3, baseMs: 50, maxMs: 300 }).catch(()=>{});
              } catch (e) {
                try { require('../../utils/logger').warn('[clockin] delete older message failed', { err: e.message, mid, evId: ev.id }); } catch {}
              }
            }
          } catch (err) {
            try { require('../../utils/logger').warn('[clockin] older message deletion loop failed', { err: err.message, evId: ev.id }); } catch {}
          }
        })();
      }
      updateEvent(ev.id, { autoMessages: ev.autoMessages, __clockIn: ev.__clockIn });
      // Schedule auto deletion & role reset if deleteAfterMs configured on notif (or default) for clock-in
      try {
        const delMs = Number(notif.deleteAfterMs ?? (config.autoMessages?.defaultDeleteMs || 0));
        if (delMs > 0) {
            setTimeout(() => {
              (async () => {
                try {
                  const { retry } = require('../../utils/retry');
                  await retry(() => sent.delete(), { attempts: 3, baseMs: 50, maxMs: 300 }).catch(()=>{});
                } catch (e) { try { require('../../utils/logger').warn('[clockin] scheduled delete failed', { err: e.message, evId: ev.id }); } catch {} }
                try {
                  // Prune positions and clear consumed autoNext entries
                  try { const { pruneClockInForEvent } = require('../../utils/clockinPrune'); pruneClockInForEvent(ev.id, { clearConsumedAutoNext: true }); } catch {}
                } catch {}
              })();
            }, delMs);
          }
      } catch {}
    }
    return !!sent;
  }
  let payload;
  if (notif.messageJSON && typeof notif.messageJSON === 'object') {
    const base = { ...notif.messageJSON };
    if (base.embeds && !Array.isArray(base.embeds)) base.embeds = [base.embeds];
    if (!base.content && !base.embeds) base.content = notif.message || `Auto message (${ev.name})`;
    payload = applyPlaceholdersToJsonPayload(base, ev);
  } else {
    let content = notif.message || '';
    content = applyTimestampPlaceholders(content, ev);
    if (config.testingMode) content = sanitizeMentionsForTesting(content);
    if (!content) content = `Auto message (${ev.name})`;
    payload = { content };
  }
  // Prepend role mentions if configured
  if (Array.isArray(notif.mentions) && notif.mentions.length) {
    const mentionLine = notif.mentions.map(r=>`<@&${r}>`).join(' ');
    if (payload.content) payload.content = `${mentionLine}\n${payload.content}`.slice(0,2000);
    else payload.content = mentionLine.slice(0,2000);
    payload.allowedMentions = { roles: notif.mentions.slice(0,20) };
  }
  if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
  const sent = await channel.send(payload).catch(()=>null);
  try {
    const delMs = Number(notif.deleteAfterMs ?? (config.autoMessages?.defaultDeleteMs || 0));
    if (!config.testingMode && sent && delMs > 0) {
      setTimeout(() => { try { sent.delete().catch(()=>{}); } catch {} }, delMs);
    }
  } catch {}
  try {
    if (sent && sent.id) {
      const map = ev.__notifMsgs && typeof ev.__notifMsgs==='object' ? { ...ev.__notifMsgs } : {};
      const rec = map[notif.id] && typeof map[notif.id]==='object' ? { ...map[notif.id] } : { channelId: channel.id, ids: [] };
      rec.channelId = channel.id;
      rec.ids = Array.isArray(rec.ids) ? rec.ids : [];
      rec.ids.push(sent.id);
      if (rec.ids.length > 20) rec.ids = rec.ids.slice(-20);
      map[notif.id] = rec;
      updateEvent(ev.id, { __notifMsgs: map });
    }
  } catch {}
  if (sent && !config.testingMode) {
    notif.__skipUntil = Date.now() + 60*60*1000;
    notif.lastManualTrigger = Date.now();
    updateEvent(ev.id, { autoMessages: ev.autoMessages });
  }
  return !!sent;
}

module.exports = { ensureAnchor, manualTriggerAutoMessage };
