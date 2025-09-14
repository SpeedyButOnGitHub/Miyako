// Early crash reporter (must be first)
require('./utils/crashReporter').initEarly();
// Phase 2: ensure runtime JSON migrated to /data (idempotent)
try { require('../scripts/migrate-runtime-data').migrate(); } catch {}
// Prevent multiple concurrent bot instances (esp. if accidentally started twice)
try { require('./utils/singleton').ensureSingleton(); } catch {}
try { process.title = 'MiyakoBot'; } catch {}
require('dotenv/config');
// (ephemeralShim removed; all interactions now use flags:1<<6 directly)
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
// UI layer (Phase 3 consolidated)
const { semanticButton, buildNavRow, createEmbed } = require('./ui');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(process.cwd());
const { config, saveConfig } = require('./utils/storage');
const { registerErrorListener } = require('./utils/errorUtil');
let lastOfflineDurationMs = null;
try {
  const lastShutdownPath = path.join(projectRoot, 'config', 'lastShutdown.json');
  if (fs.existsSync(lastShutdownPath)) {
    const raw = JSON.parse(fs.readFileSync(lastShutdownPath, 'utf8'));
    if (raw && raw.ts) {
      lastOfflineDurationMs = Date.now() - raw.ts;
      // remove file after reading
      try { fs.unlinkSync(lastShutdownPath); } catch {}
    }
  }
} catch {}
const { attachMessageEvents } = require('./events/messages');
const { attachGuildEvents } = require('./events/guildEvents');
const { attachInteractionEvents } = require('./events/interactionEvents');
// Legacy command handler in events/messageEvents.js caused duplicate replies; ensure not required/attached elsewhere.
try { delete require.cache[require.resolve('../events/messageEvents')]; } catch {}
let CRASH_LOG_CHANNEL_ID = null; // resolved post-config load
const { startScheduler } = require('./utils/scheduler');
const logger = require('./utils/logger');
const ActiveMenus = require('./utils/activeMenus');
const { startVoiceLeveling } = require('./utils/voiceLeveling');
const { validateConfig } = require('./utils/configValidate');
const { startCashDrops } = require('./utils/cashDrops');
const { getEvents, updateEvent } = require('./utils/eventsStorage');
// Load daily deposit progress tracker
try { require('./utils/depositProgress').load(); } catch {}

const BOT_STATUS_FILE = path.join(projectRoot, 'config', 'botStatus.json');

// Real-time error forwarding (compact). Fires after client ready.
registerErrorListener(async (entry) => {
  try {
    if (!client.isReady || !client.isReady()) return; // wait for ready
    if (!CRASH_LOG_CHANNEL_ID) CRASH_LOG_CHANNEL_ID = config.crashLogChannelId || CONFIG_LOG_CHANNEL;
    if (!CRASH_LOG_CHANNEL_ID) return; // nowhere to send
    const channel = await client.channels.fetch(CRASH_LOG_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    // De-duplicate high volume warnings; throttle identical scope+message pairs within 30s
    global.__ERR_CACHE = global.__ERR_CACHE || new Map();
    const key = entry.scope + ':' + entry.message.slice(0, 120);
    const now = Date.now();
    const prev = global.__ERR_CACHE.get(key);
    if (prev && (now - prev) < 30000) return; // skip spam
    global.__ERR_CACHE.set(key, now);
    // Build compact embed
    const em = createEmbed({
      title: `⚠️ ${entry.scope}`,
      description: `\u200B\n\`${(entry.message || '').slice(0, 350).replace(/`/g, '\u200b')}\`\n\u200B`,
      color: entry.scope.startsWith('fatal') ? 0xE74C3C : 0xFFA500,
    });
    em.setFooter({ text: `At <t:${Math.floor(entry.ts / 1000)}:T>` });
    await channel.send({ embeds: [em] }).catch(() => {});
  } catch { /* ignore */ }
});
// After client ready, start voice leveling service
// This file's ready handler likely exists below; if not, attach minimal
if (require.main === module) {
  // Lazy attach to client when created in this module
}
const STATUS_CHANNEL_ID = '1413966369296220233';
const ACTIVE_MENUS_FILE = path.join(projectRoot, 'config', 'activeMenus.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// --- Global error capture layer (non-recursive) ---
try {
  const { recordExternalError, setOriginalConsoleError } = require('./utils/errorUtil');
  const origConsoleError = console.error;
  setOriginalConsoleError(origConsoleError);
  console.error = function (...args) {
    try {
      recordExternalError('console', args.length === 1 ? args[0] : args.map((a) => (a && a.stack) ? a.stack : String(a)).join(' '));
    } catch { /* ignore */ }
    return origConsoleError.apply(this, args);
  };
  process.on('warning', (w) => recordExternalError('warning', w));
} catch { /* ignore capture setup errors */ }

// Attach client to crashReporter for graceful shutdown details
try { require('./utils/crashReporter').attachClient(client); } catch {}

const { runHealthChecks, formatHealthLines } = require('./utils/health');
const { CONFIG_LOG_CHANNEL } = require('./utils/logChannels');
const { safeAddField } = require('./ui');

async function sendBotStatusMessage() {
  let lastOnline = 0;
  if (fs.existsSync(BOT_STATUS_FILE)) {
    try { lastOnline = JSON.parse(fs.readFileSync(BOT_STATUS_FILE)).lastOnline || 0; } catch {}
  }
  const now = Date.now();
  const diff = now - lastOnline;
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (channel) {
    // Build a single, modern embed with inline smart changelog
    const isColdStart = diff >= 5 * 60 * 1000;
    const title = isColdStart ? '🟢 Miyako is Online' : '🔄 Miyako Restarted';
    const color = isColdStart ? 0x5865F2 : 0xFFD700;

    const embed = createEmbed({
      title,
      description: isColdStart
        ? "All systems are up. Here's what changed since last run:"
        : `Restart complete. ${lastOfflineDurationMs != null ? `Offline for ${Math.max(0, Math.round(lastOfflineDurationMs / 1000))}s.` : ''} Here's what changed since last run:`,
      color,
    });

    // Build changelog overview + store details for button expansion
    let changelogSession = null;
    try {
      const changelog = require('./utils/changelog');
      try {
        // Use the changelog module's snapshot helpers to ensure consistent format
        const prevSnap = changelog.loadSnapshot();
        const curr = changelog.createSnapshot(projectRoot);
        const result = changelog.compareSnapshots(prevSnap, curr);
        try { changelog.saveSnapshot(curr); } catch {}
        const total = result.added.length + result.removed.length + result.modified.length;
        if (total === 0) {
          safeAddField(embed, 'Changelog Overview', 'No changes have been made since last restart.');
        } else {
          const summary = `Files changed: ${total} (➕ ${result.added.length}, ✖️ ${result.removed.length}, 🔧 ${result.modified.length})`;
          safeAddField(embed, 'Changelog Overview', summary);
          // Prepare detailed lines (full lists capped)
          const detailLines = [];
          for (const it of result.added) detailLines.push(`➕ ${it.path}`);
          for (const it of result.removed) detailLines.push(`✖️ ${it.path}`);
          for (const it of result.modified) {
            const ld = it.linesDelta === 0 ? '±0' : (it.linesDelta > 0 ? `+${it.linesDelta}` : `${it.linesDelta}`);
            detailLines.push(`🔧 ${it.path} (${ld} lines)`);
          }
          changelogSession = { summary, detailLines };
        }
      } catch (e) {
        safeAddField(embed, 'Changelog Overview', 'No changes have been made since last restart.');
      }
    } catch (e) {
      safeAddField(embed, 'Changelog Overview', 'No changes have been made since last restart.');
    }

    // Run health checks (events + staff team) and append compact status block at top of embed
    try {
      const health = await runHealthChecks(client);
      if (health && health.length) {
        const lines = formatHealthLines(health).slice(0, 1024);
        embed.spliceFields(0, 0, { name: 'Health', value: lines });
      }
    } catch (e) {
      safeAddField(embed, 'Health', '✖️ Health checks failed: ' + e.message.slice(0, 200));
    }

      // Run lightweight startup tests and persist a summary (non-blocking)
      try {
        const { runStartupTests } = require('./utils/startupTests');
        const summary = await runStartupTests(client).catch((e) => ({ ok: false, err: String(e) }));
        // If we have a config log channel, attempt to send a tiny summary embed
        try {
          if (CONFIG_LOG_CHANNEL) {
            const ch = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
            if (ch) {
              const sEm = createEmbed({ title: 'Startup Tests', description: summary.ok ? 'All quick checks passed ✅' : 'Some quick checks failed ⚠️', color: summary.ok ? 0x2ECC71 : 0xE67E22 });
              sEm.addFields({ name: 'Checks', value: `${summary.checks.length} quick checks` });
              // Add changelog snapshot summary if present
              if (summary.checks) {
                const cs = summary.checks.find(c => c.name === 'changelog_snapshot');
                if (cs && cs.ok && cs.info) {
                  sEm.addFields({ name: 'Changelog', value: `➕ ${cs.info.added}  ✖️ ${cs.info.removed}  🔧 ${cs.info.modified}` });
                }
              }
              // Add small health digest if available
              if (summary.health && Array.isArray(summary.health)) {
                const nonOk = summary.health.filter(h => !h.ok).slice(0, 5);
                if (nonOk.length) {
                  const lines = nonOk.map(n => `• ${n.name || n.kind}: ${n.error || 'unknown'}`).join('\n');
                  sEm.addFields({ name: 'Health issues', value: lines });
                } else {
                  sEm.addFields({ name: 'Health', value: 'All health checks OK' });
                }
              }
              ch.send({ embeds: [sEm] }).catch(() => {});
            }
          }
        } catch (e) { logger.warn('[StartupTests] could not send summary', { err: e && e.message }); }
      } catch (e) { logger.warn('[StartupTests] runner failed', { err: e && e.message }); }

    // Components: Details button only if we have detail lines
    let components = [];
    if (changelogSession && changelogSession.detailLines && changelogSession.detailLines.length) {
      components = [
        buildNavRow([
          semanticButton('primary', { id: 'status_show', label: 'Details' }),
        ]),
      ];
    }
    const sent = await channel.send({ embeds: [embed], components }).catch(() => null);
    if (sent && changelogSession) {
      try {
        ActiveMenus.registerMessage(sent, { type: 'status', data: { ...changelogSession, expanded: false } });
      } catch {}
    }
  }
  fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ lastOnline: now }, null, 2));
}

async function setStatusChannelName(online) {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.setName) return;
  const name = online
    ? '🟢︎𝙼𝚒𝚢𝚊𝚔𝚘-𝚜𝚝𝚊𝚝𝚞𝚜'
    : '🔴︎𝙼𝚒𝚢𝚊𝚔𝚘-𝚜𝚝𝚊𝚝𝚞𝚜';
  await channel.setName(name).catch(() => {});
}

// (SIGINT/SIGTERM now handled gracefully by crashReporter; no duplicate handlers here)

// Use 'clientReady' instead of deprecated 'ready' (v15 will remove 'ready')
client.once('clientReady', async () => {
  config.testingMode = false; saveConfig();
  logger.info(`Logged in as ${client.user.tag}`);
  await sendBotStatusMessage();
  await setStatusChannelName(true);

  // Config validation report (deduplicated per boot)
  try {
    const guild = client.guilds.cache.first();
    const issues = validateConfig(guild);
    if (issues.length) {
      console.warn(`[config] ${issues.length} issue(s):`);
      for (const i of issues) console.warn(' -', i);
      if (CONFIG_LOG_CHANNEL) {
        const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
        if (channel) {
          const hash = require('crypto').createHash('sha1').update(issues.join('|')).digest('hex');
          const stampFile = path.join(projectRoot, 'config', '.lastConfigIssuesHash');
          let prev = null; try { if (fs.existsSync(stampFile)) prev = fs.readFileSync(stampFile, 'utf8').trim(); } catch {}
          if (prev !== hash) {
            channel.send({ content: `⚠️ Config validation found ${issues.length} issue(s):\n` + issues.map(i => `• ${i}`).join('\n') }).catch(() => {});
            try { fs.writeFileSync(stampFile, hash); } catch {}
          } else {
            logger.debug('Config issues unchanged since last boot; not re-sent');
          }
        }
      }
    } else {
  logger.info('Config validation passed');
    }
  } catch (err) {
    logger.error('[config] validation error', { err: err.message });
  }
  // Changelog now included inside the status embed above

  // Initialize global button/session manager (restores timers and disables expired UIs)
  try { await ActiveMenus.init(client); } catch (e) { logger.error('[ActiveMenus init]', { err: e.message }); }
  // Sweep orphaned (stale) interactive menus (older than 1h) for cleanliness
  try { if (ActiveMenus.sweepOrphans) await ActiveMenus.sweepOrphans(client); } catch {}

  // Start the scheduler loop
  try { startScheduler(client); } catch (e) { logger.error('[Scheduler] start error', { err: e.message }); }

  // Reconstruct persisted scheduled delete timers so message TTLs survive restarts
  try {
    const { reconstructScheduledDeletes } = require('./commands/schedule/notifications');
    try { await reconstructScheduledDeletes(client); } catch (e) { logger.warn('[reconstructScheduledDeletes] failed', { err: e && e.message }); }
  } catch (e) { logger.warn('[reconstructScheduledDeletes] require failed', { err: e && e.message }); }

  // Start voice leveling loop
  try { startVoiceLeveling(client); } catch (e) { logger.error('[VoiceLeveling] start error', { err: e.message }); }

  // Start cash drops cleanup loop
  try { startCashDrops(); } catch (e) { logger.error('[CashDrops] start error', { err: e.message }); }

  // Basic permission health check for critical channels
  try {
    const important = [STATUS_CHANNEL_ID, config.modLogChannelId].filter(Boolean);
    for (const id of important) {
      const ch = await client.channels.fetch(id).catch(() => null);
      if (ch && ch.permissionsFor && !ch.permissionsFor(client.user.id)?.has('SendMessages')) {
        console.warn('[perm] Missing SendMessages in channel', id);
      }
    }
  } catch {}

  // After boot, refresh recent auto/clock-in messages to apply latest patches
  try {
    const { getEvents } = require('./utils/eventsStorage');
    const { refreshTrackedAutoMessages } = require('./commands/schedule');
    const evs = getEvents();
    for (const ev of evs) {
      // Light throttle to avoid rate limits on large sets
      // Force refresh at startup so persisted auto messages are reconciled
      // with the latest payloads (prevents stale or incorrect content from
      // surviving a restart)
      try { await refreshTrackedAutoMessages(client, ev, { forceAll: true }); } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch (e) { logger.error('[Startup Refresh] error', { err: e.message }); }

  // Cleanup lingering menus on restart
  if (fs.existsSync(ACTIVE_MENUS_FILE)) {
    try {
      const menus = JSON.parse(fs.readFileSync(ACTIVE_MENUS_FILE));
      for (const { channelId, messageId, commandId } of menus) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel) {
          await channel.messages.delete(messageId).catch(() => {});
          await channel.messages.delete(commandId).catch(() => {});
        }
      }

        // Ensure currently-open events have their anchor/clock-in messages present.
        try {
          const { ensureAnchor, manualTriggerAutoMessage } = require('./commands/schedule/actions');
          const evs2 = getEvents();
          const nowDt = new Date();
          const currentDay = nowDt.getDay();
          const hh = nowDt.getHours().toString().padStart(2, "0");
          const mm = nowDt.getMinutes().toString().padStart(2, "0");
          const currentHM = `${hh}:${mm}`;

          const isOpen = (ev) => {
            try {
              if (Array.isArray(ev.ranges) && ev.ranges.length) {
                for (const r of ev.ranges) {
                  if (!r || !r.start || !r.end) continue;
                  const [sh, sm] = r.start.split(':').map(n=>parseInt(n,10));
                  const [eh, em] = r.end.split(':').map(n=>parseInt(n,10));
                  if ([sh,sm,eh,em].some(n => Number.isNaN(n))) continue;
                  const startMinutes = sh*60+sm;
                  const endMinutes = eh*60+em;
                  const curMinutes = parseInt(hh,10)*60+parseInt(mm,10);
                  if (curMinutes >= startMinutes && curMinutes < endMinutes) return true;
                }
                return false;
              }
              if (Array.isArray(ev.times) && ev.times.includes(currentHM)) {
                if (Array.isArray(ev.days) && ev.days.length && !ev.days.includes(currentDay)) return false;
                return true;
              }
            } catch {}
            return false;
          };

          for (const ev of evs2) {
            try {
              if (!ev || !ev.enabled) continue;
              if (ev.type !== 'multi-daily') continue;

              // Refresh anchor for this event so its message reflects current status
              try {
                await ensureAnchor(client, ev).catch(()=>null);
              } catch {}

              // If the event is currently open, ensure a clock-in message exists
              try {
                if (isOpen(ev)) {
                  const clk = (ev.autoMessages||[]).find(a => a.isClockIn && a.enabled);
                  const hasClockMsgs = ev.__clockIn && Array.isArray(ev.__clockIn.messageIds) && ev.__clockIn.messageIds.length > 0;
                  if (clk && !hasClockMsgs) {
                    // call manualTriggerAutoMessage with a lightweight interaction-like object that exposes client
                    await manualTriggerAutoMessage({ client }, ev, clk).catch(()=>null);
                  }
                } else {
                  // If event is not open on startup, ensure any stale clock-in messages are removed
                  try {
                    if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds) && ev.__clockIn.messageIds.length) {
                      const chId = ev.__clockIn.channelId || ev.channelId;
                      const channel = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
                      if (channel && channel.messages) {
                        for (const mid of ev.__clockIn.messageIds.slice()) {
                          try { await channel.messages.fetch(mid).then(m=>m.delete()).catch(()=>{}); } catch {}
                        }
                      }
                      ev.__clockIn.messageIds = [];
                      try { updateEvent(ev.id, { __clockIn: ev.__clockIn }); } catch {}
                    }
                  } catch {}
                }
              } catch {}
            } catch {}
          }
        } catch (e) { logger && logger.warn && logger.warn('[Startup Reconcile] failed', { err: e && e.message }); }
      fs.writeFileSync(ACTIVE_MENUS_FILE, '[]');
  } catch (err) { logger.warn('[Startup Menu Cleanup Error]', { err: err.message }); }
  }
});

// Status (startup) details handler
try {
  ActiveMenus.registerHandler('status', async (interaction, session) => {
    if (!interaction.isButton()) return;
    const data = session.data || {}; // { summary, detailLines, expanded }
    if (interaction.customId === 'status_show') {
      data.expanded = true;
      // Rebuild embed from original message but replace/add Details field
      const embed = EmbedBuilder.from(interaction.message.embeds[0] || {});
      // Remove existing Details field if any
      const fields = embed.data.fields || [];
      const filtered = fields.filter((f) => f.name !== 'Details');
      if (data.detailLines && data.detailLines.length) {
        const chunked = [];
        let current = [];
        let totalLen = 0;
        for (const line of data.detailLines) {
          if ((totalLen + line.length + 1) > 1000 && current.length) {
            chunked.push(current.join('\n'));
            current = [];
            totalLen = 0;
          }
          current.push(line);
          totalLen += line.length + 1;
        }
        if (current.length) chunked.push(current.join('\n'));
        // Discord limit: keep at most 2 detail fields for brevity
        filtered.push({ name: 'Details', value: chunked[0].slice(0, 1024) });
        if (chunked[1]) filtered.push({ name: 'Details (cont.)', value: chunked[1].slice(0, 1024) });
      }
      embed.setFields(filtered);
      const rows = [
        buildNavRow([
          semanticButton('nav', { id: 'status_hide', label: 'Hide' }),
        ]),
      ];
      await interaction.update({ embeds: [embed], components: rows });
      session.data = data;
      return;
    }
    if (interaction.customId === 'status_hide') {
      data.expanded = false;
      const embed = EmbedBuilder.from(interaction.message.embeds[0] || {});
      const fields = (embed.data.fields || []).filter((f) => !f.name.startsWith('Details'));
      // Ensure overview field name is 'Changelog Overview'
      embed.setFields(fields.map((f) => (f.name === 'Changelog' ? { ...f, name: 'Changelog Overview' } : f)));
      const rows = [
        buildNavRow([
          semanticButton('primary', { id: 'status_show', label: 'Details' }),
        ]),
      ];
      await interaction.update({ embeds: [embed], components: rows });
      session.data = data;
      return;
    }
  });
} catch (e) { /* ignore registration errors */ }

// attach modular handlers
attachMessageEvents(client);
attachGuildEvents(client);
attachInteractionEvents(client);

client.login(process.env.DISCORD_TOKEN);
