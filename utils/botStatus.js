// filepath: c:\Users\tevme\Documents\Miyako\utils\botStatus.js
async function sendBotStatusMessage(client) {
  console.log("[BotStatus] sendBotStatusMessage called.");
}
async function setStatusChannelName(client, online) {
  console.log(`[BotStatus] setStatusChannelName called. Online: ${online}`);
}
module.exports = {
  sendBotStatusMessage,
  setStatusChannelName
};