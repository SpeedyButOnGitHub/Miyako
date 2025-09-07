require("dotenv/config");
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { config, saveConfig } = require("./utils/storage");
const { attachMessageEvents } = require("./events/messages");
const { attachGuildEvents } = require("./events/guildEvents");
const { attachInteractionEvents } = require("./events/interactionEvents");
// debug: ensure functions are imported correctly
// console.log('attachMessageEvents typeof =', typeof attachMessageEvents);
// console.log('attachGuildEvents typeof =', typeof attachGuildEvents);

const BOT_STATUS_FILE = path.resolve(__dirname, "./config/botStatus.json");
const STATUS_CHANNEL_ID = "1413966369296220233";
const ACTIVE_MENUS_FILE = path.resolve(__dirname, "./config/activeMenus.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
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
    const starting = new EmbedBuilder()
      .setTitle(diff >= 5 * 60 * 1000 ? "🟢 Starting" : "🔄 Restarting")
      .setColor(diff >= 5 * 60 * 1000 ? 0x5865F2 : 0xffd700)
      .setDescription(diff >= 5 * 60 * 1000 ? "Miyako has woken up." : "Miyako is restarting...")
      .setTimestamp();
    const sent = await channel.send({ embeds: [starting] }).catch(() => null);
    if (sent && diff < 5 * 60 * 1000) {
      setTimeout(async () => {
        const awake = new EmbedBuilder().setTitle("🟢 Starting").setColor(0x5865F2).setDescription("Miyako has woken up.").setTimestamp();
        await sent.edit({ embeds: [awake] }).catch(() => {});
      }, 5000);
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
    process.exit(0);
  });
}

client.once("ready", async () => {
  config.testingMode = false; saveConfig();
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendBotStatusMessage();
  await setStatusChannelName(true);

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
