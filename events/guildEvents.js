const { logMessageDelete, logMessageEdit } = require("../utils/messageLogs");
const { handleMessageDelete } = require("../commands/snipes");

function attachGuildEvents(client) {
	client.on("messageDelete", (message) => {
		logMessageDelete(client, message);
		handleMessageDelete(client, message);
	});
	client.on("messageUpdate", (oldMsg, newMsg) => logMessageEdit(client, oldMsg, newMsg));
}

module.exports = { attachGuildEvents };
