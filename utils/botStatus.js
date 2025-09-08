const { EmbedBuilder } = require("discord.js");
const fs = require("fs");

const STATUS_CHANNEL_ID = "1413966369296220233";
const BOT_STATUS_FILE = "./config/botStatus.json";

async function sendBotStatusMessage(client) {
  let lastOnline = 0;
  if (fs.existsSync(BOT_STATUS_FILE)) {
    try {
      const status = JSON.parse(fs.readFileSync(BOT_STATUS_FILE, "utf8"));
      lastOnline = status.lastOnline || 0;
    } catch {}
  }
  const now = Date.now();
  const diff = now - lastOnline;
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (channel) {
    const restarted = diff >= 5 * 60 * 1000;
    const embed = new EmbedBuilder()
      .setTitle(restarted ? "🟢 Restarted" : "🟢 Online")
      .setColor(0x55ff55)
      .setDescription(restarted ? "Miyako has restarted and is now online!" : "Miyako is now online!")
      .setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` })
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
  try { fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ lastOnline: now }, null, 2)); } catch {}
}

async function sendBotShutdownMessage(client) {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle("🔴 Shutting Down")
      .setColor(0xff0000)
      .setDescription("Miyako is shutting down <:dead:1414023466243330108>.")
      .setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` })
      .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function setStatusChannelName(client, online) {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (!channel || typeof channel.setName !== "function") return;
  const name = online
    ? "🟢︱𝙼𝚒𝚢𝚊𝚔𝚘𝚜-𝙲𝚑𝚊𝚖𝚋𝚎𝚛"
    : "🔴︱𝙼𝚒𝚢𝚊𝚔𝚘𝚜-𝙲𝚑𝚊𝚖𝚋𝚎𝚛";
  await channel.setName(name).catch(() => {});
}

module.exports = {
  sendBotStatusMessage,
  sendBotShutdownMessage,
  setStatusChannelName
};
