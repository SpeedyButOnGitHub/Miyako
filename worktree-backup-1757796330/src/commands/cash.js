const { formatCash, getCash } = require("../utils/cash");

async function handleCashCommand(client, message) {
	const amount = getCash(message.author.id);
	try {
		await message.reply({ content: `💸 You have ${formatCash(amount)}.`, allowedMentions: { repliedUser: false } });
	} catch {}
}

module.exports = { handleCashCommand };
