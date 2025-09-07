const { EmbedBuilder } = require("discord.js");const fs = require("fs");const STATUS_CHANNEL_ID = "1413966369296220233";const BOT_STATUS_FILE = "./config/botStatus.json";async function sendBotStatusMessage(client) {  let lastOnline = 0;  if (fs.existsSync(BOT_STATUS_FILE)) {    try {      const status = JSON.parse(fs.readFileSync(BOT_STATUS_FILE));      lastOnline = status.lastOnline || 0;    } catch {}  }  const now = Date.now();  const diff = now - lastOnline;  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);  if (channel) {    let embed;    if (diff >= 5 * 60 * 1000) {      embed = new EmbedBuilder()        .setTitle("🟢 Restarted")        .setColor(0x55ff55)        .setDescription("Miyako has restarted and is now online!")        .setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` })        .setTimestamp();    } else {      embed = new EmbedBuilder()        .setTitle("🟢 Online")        .setColor(0x55ff55)        .setDescription("Miyako is now online!")        .setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` })        .setTimestamp();    }    await channel.send({ embeds: [embed] });  }  fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ lastOnline: now }, null, 2));}async function sendBotShutdownMessage(client) {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (channel) {
    const embed = new EmbedBuilder()
      .setTitle("🔴 Shutting Down")
      .setColor(0xff0000)
      .setDescription("Miyako is shutting down <:dead:1414023466243330108>.")
      .setFooter({ text: `Timestamp: ${new Date().toLocaleString()}` })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  }
}

async function setStatusChannelName(client, online) {
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.setName) return;
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
