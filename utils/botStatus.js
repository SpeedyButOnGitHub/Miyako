async function sendBotStatusMessage(client) {
  console.log("[BotStatus] sendBotStatusMessage called.");
}

async function setStatusChannelName(client, online) {
  console.log(`[BotStatus] setStatusChannelName called. Online: ${online}`);
}

// Ensure processHandlers can call this without crashing
async function sendBotShutdownMessage(client) {
  console.log("[BotStatus] sendBotShutdownMessage called.");
}

module.exports = {
  sendBotStatusMessage,
  setStatusChannelName,
  sendBotShutdownMessage
};
