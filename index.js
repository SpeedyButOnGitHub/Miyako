require("dotenv/config");
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require("discord.js");
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

    // Inline changelog: compute diff and add as fields/description
    try {
      const { createSnapshot, compareSnapshots } = require("./utils/changelog");
      const snapshotFile = path.resolve(__dirname, "./config/changelogSnapshot.json");
      let prev = null;
      try { if (fs.existsSync(snapshotFile)) prev = JSON.parse(fs.readFileSync(snapshotFile, "utf8")); } catch {}
      const curr = createSnapshot(path.resolve(__dirname));
      const result = compareSnapshots(prev, curr);
      // save new snapshot
      try { fs.writeFileSync(snapshotFile, JSON.stringify({ createdAt: Date.now(), files: curr }, null, 2)); } catch {}

      const total = result.added.length + result.removed.length + result.modified.length;
      if (total === 0) {
        embed.addFields({ name: "Changelog", value: "No changes have been made since last restart." });
      } else {
        const lines = [];
        const cap = (arr, n) => arr.slice(0, n);
        for (const it of cap(result.added, 4)) lines.push(`➕ ${it.path}`);
        for (const it of cap(result.removed, 4)) lines.push(`✖️ ${it.path}`);
        for (const it of cap(result.modified, 6)) {
          const ld = it.linesDelta === 0 ? "±0" : (it.linesDelta > 0 ? `+${it.linesDelta}` : `${it.linesDelta}`);
          lines.push(`🔧 ${it.path} (${ld} lines)`);
        }
        // Simple "smart" grouping summary
        const summary = `Files changed: ${total} (➕ ${result.added.length}, ✖️ ${result.removed.length}, 🔧 ${result.modified.length})`;
        embed.addFields({ name: "Changelog", value: summary });
        if (lines.length) embed.addFields({ name: "Details", value: lines.join("\n").slice(0, 1024) });
      }
    } catch (e) {
      // Fallback description
      embed.addFields({ name: "Changelog", value: "No changes have been made since last restart." });
    }

    await channel.send({ embeds: [embed] }).catch(() => null);
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

// attach modular handlers
attachMessageEvents(client);
attachGuildEvents(client);
attachInteractionEvents(client);

client.login(process.env.DISCORD_TOKEN);
