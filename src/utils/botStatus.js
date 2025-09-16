// Backwards-compatible thin wrappers over the status service (src-native)
const service = require('../services/statusService');

async function sendBotStatusMessage(client) {
	return service.postStartup(client);
}
async function sendBotShutdownMessage(client) {
	return service.postShutdown(client);
}
async function setStatusChannelName(client, online) {
	return service.updateStatusChannelName(client, online);
}

module.exports = { sendBotStatusMessage, sendBotShutdownMessage, setStatusChannelName };
