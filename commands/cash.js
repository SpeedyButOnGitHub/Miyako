const { formatCash, getCash } = require("../utils/cash");

async function handleCashCommand(client, message) {
  const amount = getCash(message.author.id);
  await message.reply(`💸 You have ${formatCash(amount)}.`).catch(() => {});
}

module.exports = { handleCashCommand };
