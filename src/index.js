// Early crash reporter (must be first)
require('./utils/crashReporter').initEarly();
// Prevent multiple concurrent bot instances (esp. if accidentally started twice)
try { require('./utils/singleton').ensureSingleton(); } catch {}
try { process.title = 'MiyakoBot'; } catch {}
require('dotenv/config');
// (ephemeralShim removed; all interactions now use flags:1<<6 directly)
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { semanticButton, buildNavRow } = require('./utils/ui');
const fs = require('fs');
const path = require('path');
const projectRoot = path.resolve(process.cwd());
const { config, saveConfig } = require('./utils/storage');
const { postStartupChangelog } = require('./utils/changelog');
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
const ActiveMenus = require('./utils/activeMenus');
const { startVoiceLeveling } = require('./utils/voiceLeveling');
const { validateConfig } = require('./utils/configValidate');
const { startCashDrops } = require('./utils/cashDrops');
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
const { createEmbed, safeAddField } = require('./utils/embeds');

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
      const { createSnapshot, compareSnapshots } = require('./utils/changelog');
      const snapshotFile = path.join(projectRoot, 'config', 'changelogSnapshot.json');
      let prev = null;
      try { if (fs.existsSync(snapshotFile)) prev = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); } catch {}
      const curr = createSnapshot(projectRoot);
      const result = compareSnapshots(prev, curr);
      try { fs.writeFileSync(snapshotFile, JSON.stringify({ createdAt: Date.now(), files: curr }, null, 2)); } catch {}
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
  console.log(`✅ Logged in as ${client.user.tag}`);
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
            console.log('[config] issues unchanged since last boot; not re-sent');
          }
        }
      }
    } else {
      console.log('[config] validation passed');
    }
  } catch (err) {
    console.error('[config] validation error', err);
  }
  // Changelog now included inside the status embed above

  // Initialize global button/session manager (restores timers and disables expired UIs)
  try { await ActiveMenus.init(client); } catch (e) { console.error('[ActiveMenus init]', e); }
  // Sweep orphaned (stale) interactive menus (older than 1h) for cleanliness
  try { if (ActiveMenus.sweepOrphans) await ActiveMenus.sweepOrphans(client); } catch {}

  // Start the scheduler loop
  try { startScheduler(client); } catch (e) { console.error('[Scheduler] start error:', e); }

  // Start voice leveling loop
  try { startVoiceLeveling(client); } catch (e) { console.error('[VoiceLeveling] start error:', e); }

  // Start cash drops cleanup loop
  try { startCashDrops(); } catch (e) { console.error('[CashDrops] start error:', e); }

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
      try { await refreshTrackedAutoMessages(client, ev); } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch (e) { console.error('[Startup Refresh] error', e); }

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
      fs.writeFileSync(ACTIVE_MENUS_FILE, '[]');
    } catch (err) { console.error('[Startup Menu Cleanup Error]:', err); }
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
