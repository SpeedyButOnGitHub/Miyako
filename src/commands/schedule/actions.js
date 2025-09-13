const theme = require('../../utils/theme');
const { config } = require('../../utils/storage');
const { updateEvent } = require('../../utils/eventsStorage');
const { applyEventName, applyPlaceholdersToJsonPayload, sanitizeMentionsForTesting } = require('./helpers');
// Position metadata used by clock-in logic (iterable, includes capacity per role)
const POSITIONS = [
  { key: 'instance_manager', cap: 1 },
  { key: 'manager', cap: 5 },
  { key: 'bouncer', cap: 10 },
  { key: 'bartender', cap: 15 },
  { key: 'backup', cap: 20 },
  { key: 'maybe', cap: 50 }
];

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
    ev.__clockIn = ev.__clockIn || { positions:{}, messageIds:[] };
    for (const p of POSITIONS) {
      if (!Array.isArray(ev.__clockIn.positions[p.key])) ev.__clockIn.positions[p.key] = [];
    }

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
  // Start a fresh set of display positions for a new clock-in message.
  // This ensures previous registrations are cleared when a new clock-in is posted
  // and only autoNext entries (or seeded testing members) populate the view.
  const displayPositions = {};
  for (const p of POSITIONS) displayPositions[p.key] = [];

    // In testing mode, optionally seed sample members for display
    try {
      if (config.testingMode && interaction.guild) {
        const guild = interaction.guild;
        let membs = guild.members?.cache?.filter(m => !m.user?.bot)?.map(m => m.id) || [];
        if (!membs || membs.length < 10) {
          try {
            const fetched = await guild.members.fetch({ time: 5000 }).catch(() => null);
            if (fetched) membs = fetched.filter(m => !m.user?.bot).map(m => m.id);
          } catch {}
        }
        const sample = (arr, n) => {
          const out = []; const pool = Array.isArray(arr) ? [...arr] : [];
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
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
            for (const id of add) if (!current.includes(id)) current.push(id);
          }
          if (Number.isFinite(cap)) while (current.length > cap) current.pop();
          displayPositions[key] = current;
        };
        ensure('instance_manager', 1);
        ensure('manager'); ensure('bouncer'); ensure('bartender'); ensure('backup'); ensure('maybe');
      }
    } catch {}

    // Apply any autoNext entries
    try {
      ev.__clockIn.autoNext = ev.__clockIn.autoNext && typeof ev.__clockIn.autoNext === 'object' ? ev.__clockIn.autoNext : {};
      const autoNextEntries = Object.entries(ev.__clockIn.autoNext || {});
      if (autoNextEntries.length) {
        for (const [userId, roleKey] of autoNextEntries) {
          if (!roleKey || !displayPositions[roleKey]) { delete ev.__clockIn.autoNext[userId]; continue; }
          const meta = POSITIONS.find(p=>p.key===roleKey);
          const cap = meta ? meta.cap : 9999;
          const arr = displayPositions[roleKey];
          if (!arr.includes(userId) && arr.length < cap) arr.push(userId);
          delete ev.__clockIn.autoNext[userId];
        }
        try {
          // Persist modified positions & cleared autoNext to the runtime overlay
          ev.__clockIn = ev.__clockIn || {};
          ev.__clockIn.positions = displayPositions;
          updateEvent(ev.id, { autoMessages: ev.autoMessages, __clockIn: ev.__clockIn });
        } catch {}
      }
    } catch {}

    // Use canonical embed builder so clock-in rendering is consistent
    try {
      const { buildClockInEmbed } = require('../../utils/clockinTemplate');
      const hydrated = { ...ev, __clockIn: { ...(ev.__clockIn || {}), positions: displayPositions } };
      const embed = buildClockInEmbed(hydrated);
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
  const prevMessageIds = Array.isArray(ev.__clockIn.messageIds) ? ev.__clockIn.messageIds.slice() : [];
      // Prepend mentions to clock-in message if configured on the notification
      const sendPayload = { content: '', embeds:[embed], components:[row] };
      try {
        if (Array.isArray(notif.mentions) && notif.mentions.length) {
          const mentionLine = notif.mentions.map(r=>`<@&${r}>`).join(' ');
          sendPayload.content = `${mentionLine}\n`;
          sendPayload.allowedMentions = { roles: notif.mentions.slice(0,20) };
        }
      } catch {}
      const sentClock = await channel.send(sendPayload).catch(()=>null);
      if (sentClock) {
        // Persist mapping for future edits
        try {
          const map = ev.__notifMsgs && typeof ev.__notifMsgs === 'object' ? { ...ev.__notifMsgs } : {};
          const rec = map[notif.id] && typeof map[notif.id] === 'object' ? { ...map[notif.id] } : { channelId: channel.id, ids: [] };
          rec.channelId = channel.id;
          rec.ids = Array.isArray(rec.ids) ? rec.ids.filter(Boolean) : [];
          if (!rec.ids.includes(sentClock.id)) rec.ids.push(sentClock.id);
          // keep recent ids only
          if (rec.ids.length > 20) rec.ids = rec.ids.slice(-20);
          map[notif.id] = rec;
          ev.__notifMsgs = map;
        } catch {}

        if (!config.testingMode) {
          notif.__skipUntil = Date.now() + 60*60*1000;
          notif.lastManualTrigger = Date.now();
          ev.__clockIn.lastSentTs = Date.now();
          ev.__clockIn.channelId = channel.id;
          if (!Array.isArray(ev.__clockIn.messageIds)) ev.__clockIn.messageIds = [];
          ev.__clockIn.messageIds = ev.__clockIn.messageIds.filter(Boolean);
          if (!ev.__clockIn.messageIds.includes(sentClock.id)) ev.__clockIn.messageIds.push(sentClock.id);
          if (ev.__clockIn.messageIds.length > 10) ev.__clockIn.messageIds = ev.__clockIn.messageIds.slice(-10);
          updateEvent(ev.id, { autoMessages: ev.autoMessages, __clockIn: ev.__clockIn, __notifMsgs: ev.__notifMsgs });

          // Attempt to delete any previous clock-in messages recorded for this event
          try {
            const { retry } = require('../../utils/retry');
            const opts = { attempts: 3, baseMs: 50, maxMs: 300 };
            for (const mid of prevMessageIds || []) {
              if (!mid || mid === sentClock.id) continue;
              try {
                const oldMsg = await channel.messages.fetch(mid).catch(()=>null);
                if (oldMsg && typeof oldMsg.delete === 'function') {
                  // use retry so tests can mock retry
                  await retry(() => oldMsg.delete(), opts).catch(()=>{});
                }
              } catch {}
            }
            // prune any deleted ids from stored arrays
            ev.__clockIn.messageIds = (ev.__clockIn.messageIds || []).filter(id => id && id === sentClock.id);
            // also prune from notif mapping
            try {
              const map = ev.__notifMsgs && typeof ev.__notifMsgs === 'object' ? { ...ev.__notifMsgs } : {};
              const rec = map[notif.id] && typeof map[notif.id] === 'object' ? { ...map[notif.id] } : null;
              if (rec && Array.isArray(rec.ids)) {
                rec.ids = rec.ids.filter(id => id && id === sentClock.id);
                map[notif.id] = rec;
                ev.__notifMsgs = map;
              }
            } catch {}
            updateEvent(ev.id, { __clockIn: ev.__clockIn, __notifMsgs: ev.__notifMsgs });
          } catch {}
        }
        return !!sentClock;
      }
    } catch (e) { /* fallback below */ }
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
      rec.ids = Array.isArray(rec.ids) ? rec.ids.filter(Boolean) : [];
      if (!rec.ids.includes(sent.id)) rec.ids.push(sent.id);
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
