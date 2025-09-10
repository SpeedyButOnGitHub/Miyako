const { addSchedule, updateSchedule, getSchedules } = require("./scheduleStorage");
const { getEvents, updateEvent } = require("./eventsStorage");
const { applyTimestampPlaceholders } = require('./timestampPlaceholders');
const { config } = require('./storage');
const ms = require("ms");
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const theme = require('./theme');
const { createEmbed } = require('./embeds');
const { CONFIG_LOG_CHANNEL } = require('./logChannels');

function applyPlaceholdersToJsonPayload(payload, ev) {
  if (!payload || typeof payload !== 'object') return payload;
  const repl = (s) => applyTimestampPlaceholders(String(s), ev);
  const sanitize = (s) => (config.testingMode ? String(s).replace(/<@&?\d+>/g, m=>`\`${m}\``) : s);
  const fixStr = (s) => sanitize(repl(s));
  const copy = { ...payload };
  if (typeof copy.content === 'string') copy.content = fixStr(copy.content).slice(0, 2000);
  if (Array.isArray(copy.embeds)) {
    copy.embeds = copy.embeds.map(e => {
      if (!e || typeof e !== 'object') return e;
      const ee = { ...e };
      if (typeof ee.title === 'string') ee.title = fixStr(ee.title);
      if (typeof ee.description === 'string') ee.description = fixStr(ee.description);
      if (ee.footer && typeof ee.footer.text === 'string') ee.footer = { ...ee.footer, text: fixStr(ee.footer.text) };
      if (ee.author && typeof ee.author.name === 'string') ee.author = { ...ee.author, name: fixStr(ee.author.name) };
      if (Array.isArray(ee.fields)) ee.fields = ee.fields.map(f => {
        if (!f || typeof f !== 'object') return f;
        const ff = { ...f };
        if (typeof ff.name === 'string') ff.name = fixStr(ff.name).slice(0, 256);
        if (typeof ff.value === 'string') ff.value = fixStr(ff.value).slice(0, 1024);
        return ff;
      });
      return ee;
    });
  }
  return copy;
}

/**
 * Schedule object shape (stored in schedules.json):
 * {
 *   id: "1",
 *   name: "Reminder",
 *   channelId: "123...",
 *   message: "Hello world",
 *   type: "once" | "daily" | "weekly" | "monthly" | "interval",
 *   time: "HH:MM" (24h),
 *   date: "YYYY-MM-DD" (for once),
 *   days: [0..6] (for weekly, 0=Sunday),
 *   intervalDays: number (for interval),
 *   repeats: null | number (remaining repeats, null = infinite),
 *   enabled: true,
 *   nextRun: 1690000000000 (timestamp ms)
 * }
 */

function parseTimeToMsToday(timeStr) {
  // timeStr: "HH:MM"
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 0, mm || 0, 0, 0);
  return t.getTime();
}

function computeNextRun(schedule) {
  const now = Date.now();
  const type = schedule.type || "once";

  const timeMsOfDay = (() => {
    if (!schedule.time) return 0;
    const [hh = 0, mm = 0] = schedule.time.split(":").map(Number);
    return hh * 3600000 + (mm || 0) * 60000;
  })();

  if (type === "once") {
    if (schedule.date && schedule.time) {
      const [y, m, d] = schedule.date.split("-").map(Number);
  const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
  const next = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
  const ts = next.getTime();
  return ts > now ? ts : null; // if time is in the past, do not reschedule
    }
    // fallback: schedule.nextRun if present
    return schedule.nextRun || null;
  }

  if (type === "daily") {
    // today at time
    let candidate = new Date();
    candidate.setHours(...((schedule.time || "00:00").split(":").map(Number)), 0, 0);
    if (candidate.getTime() <= now) candidate = new Date(candidate.getTime() + 24 * 3600000);
    return candidate.getTime();
  }

  if (type === "interval") {
    // intervalDays and nextRun
    if (schedule.nextRun && schedule.nextRun > now) return schedule.nextRun;
    // schedule.intervalDays given
    const days = Math.max(1, Number(schedule.intervalDays) || 1);
    const base = schedule.nextRun && schedule.nextRun > 0 ? schedule.nextRun : now;
    return new Date(base + days * 24 * 3600000).getTime();
  }

  if (type === "weekly") {
    // schedule.days array of weekday numbers [0..6]
    const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [1]; // default Monday
    const nowDate = new Date();
    const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);

    // search next 14 days for the next scheduled day/time
    for (let offset = 0; offset < 14; offset++) {
      const d = new Date(nowDate.getTime() + offset * 24 * 3600000);
      const wd = d.getDay(); // 0..6
      if (days.includes(wd)) {
        const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
        if (candidate.getTime() > now) return candidate.getTime();
      }
    }
    // fallback
    return now + 24 * 3600000;
  }

  if (type === "monthly") {
    // schedule.dayOfMonth
    const day = Math.max(1, Number(schedule.dayOfMonth) || 1);
    const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
    const base = new Date();
    const year = base.getFullYear();
    const month = base.getMonth();
    const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
    const dom = Math.min(day, lastDayThisMonth);
    let candidate = new Date(year, month, dom, hh, mm, 0, 0);
    if (candidate.getTime() <= now) {
      const nextMonth = month + 1;
      const lastDayNextMonth = new Date(year, nextMonth + 1, 0).getDate();
      const dom2 = Math.min(day, lastDayNextMonth);
      const next = new Date(year, nextMonth, dom2, hh, mm, 0, 0);
      return next.getTime();
    }
    return candidate.getTime();
  }

  return null;
}

async function runScheduleOnce(client, schedule) {
  try {
  const chId = config.testingMode ? (schedule.logChannelId || CONFIG_LOG_CHANNEL || schedule.channelId) : schedule.channelId;
  const channel = await client.channels.fetch(chId).catch(() => null);
    if (!channel || !channel.send) throw new Error("Invalid channel");
    // Support simple content or JSON payloads + timestamp placeholders
    // If messageJSON exists, prefer its content (even if empty) and do not fallback to the raw string in schedule.message.
    let content = '';
    if (schedule.messageJSON && typeof schedule.messageJSON === 'object') {
      let payload = { ...schedule.messageJSON };
      if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
      payload = applyPlaceholdersToJsonPayload(payload, schedule.eventRef || {});
      await channel.send(payload);
    } else {
      const raw = schedule.message || 'Scheduled message';
      content = applyTimestampPlaceholders(raw, schedule.eventRef || {});
      if (config.testingMode && content) content = content.replace(/<@&?\d+>/g, m=>`\`${m}\``);
      await channel.send({ content });
    }
    console.log(`Scheduled message sent for schedule ${schedule.id}`);
  } catch (err) {
    console.error("Failed to send scheduled message:", err);
  }
}

function computeAfterRun(schedule) {
  // manage repeats and compute nextRun or mark disabled/finished
  if (schedule.repeats !== null && typeof schedule.repeats !== "undefined") {
    schedule.repeats = Number(schedule.repeats) - 1;
    if (schedule.repeats <= 0) {
      schedule.enabled = false;
      schedule.nextRun = null;
      return schedule;
    }
  }
  // One-off schedules should disable after first run unless explicitly repeated
  if ((schedule.type || 'once') === 'once') {
    schedule.enabled = false;
    schedule.nextRun = null;
    return schedule;
  }
  // nextRun based on schedule type
  schedule.nextRun = computeNextRun(schedule);
  return schedule;
}

function startScheduler(client, opts = {}) {
  const tickInterval = opts.intervalMs || 15 * 1000;
  // Configurable clock-in dedup window (ms) via env or opts
  const CLOCKIN_DEDUP_MS = Number(process.env.CLOCKIN_DEDUP_MS) || opts.clockInDedupMs || (5 * 60 * 1000);
  const CLOCKIN_ORPHAN_MAX = Number(process.env.CLOCKIN_ORPHAN_MAX) || 10; // retain at most this many ids

  // ensure existing schedules have nextRun computed
  const schedules = getSchedules();
  for (const s of schedules) {
    if (!s.nextRun || s.nextRun < Date.now()) {
      const nr = computeNextRun(s);
      if (nr) updateSchedule(s.id, { nextRun: nr });
    }
  }

  setInterval(async () => {
    const list = getSchedules();
    const now = Date.now();
    for (const schedule of list) {
      try {
        if (!schedule.enabled) continue;
        if (!schedule.nextRun) {
          const nr = computeNextRun(schedule);
          await updateSchedule(schedule.id, { nextRun: nr });
          continue;
        }
        if (schedule.nextRun <= now + 5000) { // allow small drift
          await runScheduleOnce(client, schedule);
          const after = computeAfterRun({ ...schedule });
          await updateSchedule(schedule.id, after);
        }
      } catch (err) {
        console.error("Scheduler loop error for schedule", schedule.id, err);
      }
    }
    // Handle multi-daily events and dynamic anchor updates
    try {
      const events = getEvents();
      const nowDt = new Date();
      const currentDay = nowDt.getDay();
      const hh = nowDt.getHours().toString().padStart(2, "0");
      const mm = nowDt.getMinutes().toString().padStart(2, "0");
      const currentHM = `${hh}:${mm}`;
      for (const ev of events) {
        if (!ev.enabled) continue;
        if (ev.type !== "multi-daily") continue;
        if (Array.isArray(ev.days) && ev.days.length && !ev.days.includes(currentDay)) continue;
        if (!Array.isArray(ev.times)) continue;
        const now = Date.now();
        // Determine if we have anchor message semantics (single persistent message)
  const hasAnchor = ev.anchorMessageId && ev.anchorChannelId;
  // Parse potential ranges for status detection
        let status = 'upcoming'; // upcoming | open | closed (post)
        let activeRange = null;
        if (Array.isArray(ev.ranges) && ev.ranges.length) {
          for (const r of ev.ranges) {
            if (!r || !r.start || !r.end) continue;
            const [sh, sm] = r.start.split(':').map(n=>parseInt(n,10));
            const [eh, em] = r.end.split(':').map(n=>parseInt(n,10));
            if ([sh,sm,eh,em].some(n => Number.isNaN(n))) continue;
            const startMinutes = sh*60+sm;
            const endMinutes = eh*60+em;
            const curMinutes = parseInt(hh,10)*60+parseInt(mm,10);
            if (curMinutes >= startMinutes && curMinutes < endMinutes) { status='open'; activeRange = r; break; }
            if (curMinutes >= endMinutes) { status='closed'; }
          }
        } else {
          // Fallback: treat individual times as fire moments (legacy behavior)
          if (ev.times.includes(currentHM)) {
            const lastKey = `__lastFired_${currentHM}`;
            if (!(ev[lastKey] && now - ev[lastKey] < 60000)) {
              try {
                const channel = await client.channels.fetch(ev.channelId).catch(() => null);
                if (channel && channel.send && !hasAnchor) {
                  if (ev.messageJSON && typeof ev.messageJSON === 'object') {
                    const payload = { ...ev.messageJSON };
                    if (!payload.content && !payload.embeds) payload.content = ev.message || `Event: ${ev.name}`;
                    if (payload.content && payload.content.length > 2000) payload.content = payload.content.slice(0,1997)+'...';
                    if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
                    await channel.send(payload).catch(()=>{});
                  } else {
                    await channel.send({ content: ev.message || `Event: ${ev.name}` }).catch(()=>{});
                  }
                }
              } catch (e) { console.error('Event dispatch failed', ev.id, e); }
              ev[lastKey] = now; updateEvent(ev.id, { [lastKey]: now });
            }
          }
        }

        // --- Automated relative messages (autoMessages) ---
    if (Array.isArray(ev.autoMessages) && ev.autoMessages.length) {
          const curMinutes = parseInt(hh,10)*60 + parseInt(mm,10);
          for (const m of ev.autoMessages) {
            if (!m || !m.enabled) continue;
      // Skip if manually triggered recently and skip window active
      if (!config.testingMode && m.__skipUntil && m.__skipUntil > Date.now()) continue;
            const offset = Number(m.offsetMinutes)||0; // minutes before event time (0 = at start)
            for (const t of ev.times) {
              const [th, tm] = t.split(':').map(x=>parseInt(x,10));
              if (Number.isNaN(th) || Number.isNaN(tm)) continue;
              const eventStartMin = th*60+tm;
              // Skip offsets that would land on previous day to avoid midnight duplicates
              if (eventStartMin - offset < 0) continue;
              const targetMin = eventStartMin - offset;
              if (curMinutes === targetMin) {
                const fireKey = `__auto_${m.id}_${t}`;
                if (!(ev[fireKey] && now - ev[fireKey] < 60000)) {
                  try {
                    const targetChannelId = config.testingMode ? CONFIG_LOG_CHANNEL : (m.channelId || ev.channelId);
                    const channel = await client.channels.fetch(targetChannelId).catch(()=>null);
                    if (channel && channel.send) {
                      // Clock-In special behavior
                      if (m.isClockIn) {
                        // Maintain per-event clockIn data structure: { positions: {key: [userId]}, messageIds:[], lastEventStart: timestamp }
                        // Modernized positions: Only Instance Master has a cap (1), others unlimited.
                        const POSITIONS = [
                          { key: 'instance_manager', label: '🗝️ Instance Master', short:'IM', max: 1 },
                          { key: 'manager', label: '🛠️ Manager', short:'M' },
                          { key: 'bouncer', label: '🛡️ Bouncer', short:'B' },
                          { key: 'bartender', label: '🍸 Bartender', short:'BT' },
                          { key: 'backup', label: '🎯 Backup', short:'BK' },
                          { key: 'maybe', label: '⏳ Maybe/Late', short:'?' }
                        ];
                        const clockKey = '__clockIn';
                        const state = ev[clockKey] && typeof ev[clockKey]==='object' ? ev[clockKey] : { positions: {}, messageIds: [] };
                        for (const p of POSITIONS) { if (!Array.isArray(state.positions[p.key])) state.positions[p.key] = []; }
                        // --- Deduplication: skip sending if a recent clock-in message already exists ---
                        try {
                          const DEDUP_MS = CLOCKIN_DEDUP_MS;
                          let recentOk = false;
                          const nowTs = Date.now();
                          if (state.lastSentTs && (nowTs - state.lastSentTs) < DEDUP_MS) {
                            recentOk = true;
                          }
                          // Fallback: probe last message id if timestamp missing
                          if (!recentOk && Array.isArray(state.messageIds) && state.messageIds.length) {
                            const lastId = state.messageIds[state.messageIds.length - 1];
                            try {
                              const lastMsg = await channel.messages.fetch(lastId).catch(()=>null);
                              if (lastMsg) {
                                // If last message younger than dedup window, skip
                                if (nowTs - lastMsg.createdTimestamp < DEDUP_MS) recentOk = true;
                              }
                            } catch {}
                          }
                          if (recentOk) {
                            // Ensure state persisted (positions may have changed earlier) but do not send duplicate
                            updateEvent(ev.id, { [clockKey]: state });
                            continue; // skip creating a new clock-in embed
                          }
                        } catch {}
                        // Build base text (header) and embed fields
                        // Standardized base text (ignore any custom saved clock-in message to ensure uniformity)
                        let baseText = `🕒 Staff Clock-In — ${ev.name}`;
                        baseText = baseText.replace(/{{EVENT_NAME}}/g, ev.name || 'Event');
                        baseText = applyTimestampPlaceholders(baseText, ev).replace(/\n{3,}/g,'\n\n');
                        if (config.testingMode) {
                          // Light sanitization of role/user mentions in testing
                          baseText = baseText.replace(/<@&?\d+>/g, match => `\`${match}\``);
                        }
                        const embed = createEmbed({
                          title: `🕒 Staff Clock-In — ${ev.name}`,
                          color: theme.colors?.primary || 0x5865F2,
                          description: `${baseText}\n\nSelect a position from the menu below. One slot per staff (auto-updates).`,
                          timestamp: false
                        });
                        for (const p of POSITIONS) {
                          const arr = state.positions[p.key];
                          const value = arr.length ? arr.map(id=>`<@${id}>`).join(', ') : '—';
                          const name = p.key === 'instance_manager' ? `${p.label} (${arr.length}/1)` : `${p.label} (${arr.length})`;
                          embed.addFields({ name, value: value.substring(0,1024), inline: true });
                        }
                        const menu = new StringSelectMenuBuilder()
                          .setCustomId(`clockin:${ev.id}:${m.id}`)
                          .setPlaceholder('📋 Select a position')
                          .addOptions(
                            POSITIONS.map(p => ({
                              label: `${p.label.replace(/^[^ ]+ /,'')}`.slice(0,100),
                              value: p.key,
                              description: p.max ? `${p.short} slots ${p.max}` : `${p.short}`
                            }))
                          );
                        const row = new ActionRowBuilder().addComponents(menu);
                        const sent = await channel.send({ embeds: [embed], components: [row] }).catch(()=>null);
                        if (sent) {
                          state.messageIds.push(sent.id);
                          // Cleanup orphaned / non-existent ids beyond cap
                          if (state.messageIds.length > CLOCKIN_ORPHAN_MAX) state.messageIds = state.messageIds.slice(-CLOCKIN_ORPHAN_MAX);
                          state.lastSentTs = Date.now();
                          state.channelId = targetChannelId;
                          updateEvent(ev.id, { [clockKey]: state });
                        }
                      } else if (m.messageJSON && typeof m.messageJSON === 'object') {
                        let payload = { ...m.messageJSON };
                        if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
                        payload = applyPlaceholdersToJsonPayload(payload, ev);
                        if (!payload.content && !payload.embeds) payload.content = m.message || `Auto message (${ev.name})`;
                        await channel.send(payload).catch(()=>{});
                      } else {
                        const raw = m.message || `Auto message (${ev.name})`;
                        let content = applyTimestampPlaceholders(raw, ev);
                        if (config.testingMode) content = content.replace(/<@&?\d+>/g, m=>`\`${m}\``);
                        await channel.send({ content }).catch(()=>{});
                      }
                    }
                  } catch (e) { console.error('Auto message dispatch failed', ev.id, m.id, e); }
                  ev[fireKey] = now; updateEvent(ev.id, { [fireKey]: now });
                }
              }
            }
          }
        }

        // Dynamic anchor update
        if (hasAnchor) {
          try {
            const channel = await client.channels.fetch(ev.anchorChannelId).catch(()=>null);
            if (channel) {
              const msg = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
              if (msg) {
                let baseContent = ev.dynamicBaseContent || ev.messageJSON?.content || ev.message || '';
                baseContent = applyTimestampPlaceholders(baseContent, ev);
                if (!baseContent) baseContent = `Event: ${ev.name}`;
                let newContent = baseContent;
                // Replace status line tokens
                // Match entire status line beginning with header (case-insensitive)
                // Match any existing status line variant so we can replace consistently
                const OPEN_TOKEN = /^(# The Midnight bar is.*|🍷The Midnight Bar is currently open!🍷|The Midnight Bar is closed for now\.)$/im;
                if (status === 'open') {
                  newContent = newContent.replace(OPEN_TOKEN, '🍷The Midnight Bar is currently open!🍷');
                } else if (status === 'closed') {
                  try {
                    const { computeNextRange } = require('./timestampPlaceholders');
                    const next = computeNextRange(ev);
                    if (next && OPEN_TOKEN.test(newContent)) {
                      newContent = newContent.replace(OPEN_TOKEN, `# The Midnight bar is opening: <t:${next.startSec}:R>`);
                    } else if (OPEN_TOKEN.test(newContent)) {
                      // Fallback if we cannot compute next
                      newContent = newContent.replace(OPEN_TOKEN, '# The Midnight bar is opening: (soon)');
                    }
                  } catch {
                    if (OPEN_TOKEN.test(newContent)) newContent = newContent.replace(OPEN_TOKEN, '# The Midnight bar is opening: (soon)');
                  }
                } else if (status === 'upcoming') {
                  try {
                    const { computeNextRange } = require('./timestampPlaceholders');
                    const range = computeNextRange(ev);
                    if (range && OPEN_TOKEN.test(newContent)) {
                      const relTs = `<t:${range.startSec}:R>`;
                      newContent = newContent.replace(OPEN_TOKEN, `# The Midnight bar is opening in ${relTs}`);
                    }
                  } catch {}
                }
                // Minimal change detection
                if (newContent !== msg.content) {
                  if (ev.messageJSON) {
                    const payload = { ...ev.messageJSON, content: newContent };
                    if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
                    await msg.edit(payload).catch(()=>{});
                  } else {
                    await msg.edit({ content: newContent }).catch(()=>{});
                  }
                }
              }
            }
          } catch (e) { /* ignore anchor update errors */ }
        }
        // Periodic prune of stale clock-in message IDs (deleted messages)
    try {
          if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds)) {
            const pruneInterval = 5 * 60 * 1000; // 5m
            const nowTs = Date.now();
            if (!ev.__clockIn.lastPruneTs || (nowTs - ev.__clockIn.lastPruneTs) > pruneInterval) {
      const chId = ev.__clockIn.channelId || ev.channelId;
      const channel = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
              if (channel && channel.messages) {
                const kept = [];
                for (const mid of ev.__clockIn.messageIds.slice(-10)) { // only check recent subset
                  const exists = await channel.messages.fetch(mid).then(()=>true).catch(()=>false);
                  if (exists) kept.push(mid);
                }
                if (kept.length !== ev.__clockIn.messageIds.length) {
                  ev.__clockIn.messageIds = kept;
                  ev.__clockIn.lastPruneTs = nowTs;
                  updateEvent(ev.id, { __clockIn: ev.__clockIn });
                } else {
                  ev.__clockIn.lastPruneTs = nowTs;
                  updateEvent(ev.id, { __clockIn: ev.__clockIn });
                }
              }
            }
          }
        } catch {}
      }
    } catch (e) { /* ignore event errors */ }
  }, tickInterval);
}

module.exports = {
  startScheduler,
  computeNextRun,
  computeAfterRun
};
