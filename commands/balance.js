const { EmbedBuilder } = require("discord.js");
const theme = require("../utils/theme");
const { getCash, formatCash } = require("../utils/cash");
const { getUserModifier } = require("../utils/leveling");

async function handleBalanceCommand(client, message) {
  const amount = getCash(message.author.id) || 0;
  const mult = getUserModifier(message.author.id) || 1.0;
  const embed = new EmbedBuilder()
    .setTitle("💳 Your Balance")
    .setColor(theme.colors.primary)
    .addFields(
      { name: "Cash", value: formatCash(amount), inline: true },
      { name: "Multiplier", value: `${mult.toFixed(2)}x`, inline: true }
    )
    .setFooter({ text: "Earn cash by leveling up and catching cash drops!" });
  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => {});
}

module.exports = { handleBalanceCommand };
