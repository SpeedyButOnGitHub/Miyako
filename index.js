require("dotenv/config");
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { config, saveConfig } = require("./utils/storage");
const { postStartupChangelog } = require("./utils/changelog");
let lastOfflineDurationMs = null;
try {
  if (fs.existsSync("./config/lastShutdown.json")) {
    const raw = JSON.parse(fs.readFileSync("./config/lastShutdown.json", "utf8"));
    if (raw && raw.ts) {
      lastOfflineDurationMs = Date.now() - raw.ts;
      // remove file after reading
      try { fs.unlinkSync("./config/lastShutdown.json"); } catch {}
    }
  }
} catch {}
const { attachMessageEvents } = require("./events/messages");
const { attachGuildEvents } = require("./events/guildEvents");
const { attachInteractionEvents } = require("./events/interactionEvents");
const { startScheduler } = require("./utils/scheduler");
const ActiveMenus = require("./utils/activeMenus");
const { startVoiceLeveling } = require("./utils/voiceLeveling");
const { validateConfig } = require("./utils/configValidate");
const { startCashDrops } = require("./utils/cashDrops");
// Load daily deposit progress tracker
try { require("./utils/depositProgress").load(); } catch {}
// debug: ensure functions are imported correctly
// console.log('attachMessageEvents typeof =', typeof attachMessageEvents);
// console.log('attachGuildEvents typeof =', typeof attachGuildEvents);

const BOT_STATUS_FILE = path.resolve(__dirname, "./config/botStatus.json");

// After client ready, start voice leveling service
// This file's ready handler likely exists below; if not, attach minimal
if (require.main === module) {
  // Lazy attach to client when created in this module
}
const STATUS_CHANNEL_ID = "1413966369296220233";
const ACTIVE_MENUS_FILE = path.resolve(__dirname, "./config/activeMenus.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const { runHealthChecks, formatHealthLines } = require('./utils/health');

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
  const title = isColdStart ? "🟢 Miyako is Online" : "🔄 Miyako Restarted";
    const color = isColdStart ? 0x5865F2 : 0xFFD700;

  const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
  .setDescription(isColdStart ? "All systems are up. Here's what changed since last run:" : `Restart complete. ${lastOfflineDurationMs!=null ? `Offline for ${Math.max(0, Math.round(lastOfflineDurationMs/1000))}s.` : ""} Here's what changed since last run:`)
      .setTimestamp();

    // Build changelog overview + store details for button expansion
    let changelogSession = null;
    try {
      const { createSnapshot, compareSnapshots } = require("./utils/changelog");
      const snapshotFile = path.resolve(__dirname, "./config/changelogSnapshot.json");
      let prev = null;
      try { if (fs.existsSync(snapshotFile)) prev = JSON.parse(fs.readFileSync(snapshotFile, "utf8")); } catch {}
      const curr = createSnapshot(path.resolve(__dirname));
      const result = compareSnapshots(prev, curr);
      try { fs.writeFileSync(snapshotFile, JSON.stringify({ createdAt: Date.now(), files: curr }, null, 2)); } catch {}
      const total = result.added.length + result.removed.length + result.modified.length;
      if (total === 0) {
        embed.addFields({ name: "Changelog Overview", value: "No changes have been made since last restart." });
      } else {
        const summary = `Files changed: ${total} (➕ ${result.added.length}, ✖️ ${result.removed.length}, 🔧 ${result.modified.length})`;
        embed.addFields({ name: "Changelog Overview", value: summary });
        // Prepare detailed lines (full lists capped)
        const detailLines = [];
        for (const it of result.added) detailLines.push(`➕ ${it.path}`);
        for (const it of result.removed) detailLines.push(`✖️ ${it.path}`);
        for (const it of result.modified) {
          const ld = it.linesDelta === 0 ? "±0" : (it.linesDelta > 0 ? `+${it.linesDelta}` : `${it.linesDelta}`);
          detailLines.push(`🔧 ${it.path} (${ld} lines)`);
        }
        changelogSession = { summary, detailLines };
      }
    } catch (e) {
      embed.addFields({ name: "Changelog Overview", value: "No changes have been made since last restart." });
    }

    // Run health checks (events + staff team) and append compact status block at top of embed
    try {
      const health = await runHealthChecks(client);
      if (health && health.length) {
        const lines = formatHealthLines(health).slice(0, 1024);
        embed.spliceFields(0, 0, { name: 'Health', value: lines });
      }
    } catch (e) {
      embed.addFields({ name: 'Health', value: '✖️ Health checks failed: ' + e.message.slice(0, 200) });
    }

    // Components: Details button only if we have detail lines
    let components = [];
    if (changelogSession && changelogSession.detailLines && changelogSession.detailLines.length) {
      components = [ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('status_show').setLabel('Details').setStyle(ButtonStyle.Primary)
      ) ];
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
    ? "🟢︎𝙼𝚒𝚢𝚊𝚔𝚘-𝚜𝚝𝚊𝚝𝚞𝚜"
    : "🔴︎𝙼𝚒𝚢𝚊𝚔𝚘-𝚜𝚝𝚊𝚝𝚞𝚜";
  await channel.setName(name).catch(() => {});
}

// graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    config.testingMode = false;
    saveConfig();
    if (client.isReady()) await setStatusChannelName(false);
  // Best-effort: create a fresh snapshot on shutdown so next start has a baseline
  try { require("./utils/changelog").createSnapshot && require("./utils/changelog").createSnapshot(path.resolve(__dirname)); } catch {}
    process.exit(0);
  });
}

client.once("ready", async () => {
  config.testingMode = false; saveConfig();
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendBotStatusMessage();
  await setStatusChannelName(true);

    // Config validation report
    try {
      const guild = client.guilds.cache.first();
      const issues = validateConfig(guild);
      if (issues.length) {
        console.warn(`[config] ${issues.length} issue(s):`);
        for (const i of issues) console.warn(' -', i);
        const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(()=>null);
        if (channel) {
          channel.send({ content: `⚠️ Config validation found ${issues.length} issue(s):\n` + issues.map(i=>`• ${i}`).join('\n') }).catch(()=>{});
        }
      } else {
        console.log('[config] validation passed');
      }
    } catch (err) {
      console.error('[config] validation error', err);
    }
  // Changelog now included inside the status embed above

  // Initialize global button/session manager (restores timers and disables expired UIs)
  try { await ActiveMenus.init(client); } catch (e) { console.error("[ActiveMenus init]", e); }

  // Start the scheduler loop
  try { startScheduler(client); } catch (e) { console.error("[Scheduler] start error:", e); }

  // Start voice leveling loop
  try { startVoiceLeveling(client); } catch (e) { console.error("[VoiceLeveling] start error:", e); }

  // Start cash drops cleanup loop
  try { startCashDrops(); } catch (e) { console.error("[CashDrops] start error:", e); }

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
      fs.writeFileSync(ACTIVE_MENUS_FILE, "[]");
    } catch (err) { console.error("[Startup Menu Cleanup Error]:", err); }
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
      const filtered = fields.filter(f => f.name !== 'Details');
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
        filtered.push({ name: 'Details', value: chunked[0].slice(0,1024) });
        if (chunked[1]) filtered.push({ name: 'Details (cont.)', value: chunked[1].slice(0,1024) });
      }
      embed.setFields(filtered);
      const rows = [ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('status_hide').setLabel('Hide Details').setStyle(ButtonStyle.Secondary)
      ) ];
      await interaction.update({ embeds: [embed], components: rows });
      session.data = data;
      return;
    }
    if (interaction.customId === 'status_hide') {
      data.expanded = false;
      const embed = EmbedBuilder.from(interaction.message.embeds[0] || {});
      const fields = (embed.data.fields||[]).filter(f => !f.name.startsWith('Details'));
      // Ensure overview field name is 'Changelog Overview'
      embed.setFields(fields.map(f => f.name === 'Changelog' ? { ...f, name: 'Changelog Overview' } : f));
      const rows = [ new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('status_show').setLabel('Details').setStyle(ButtonStyle.Primary)
      ) ];
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
