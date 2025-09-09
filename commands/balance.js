const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const theme = require("../utils/theme");
const { getCash, getTestingCash } = require("../utils/cash");
const { getUserModifier } = require("../utils/leveling");
const { getBank, getBaseLimit } = require("../utils/bank");

// Color logic based on bank status
function bankColor(bank, base) {
  if (bank < base) return theme.colors.primary;
  if (bank === base) return theme.colors.warning;
  return theme.colors.danger;
}

function buildStatusLine(bank, base) {
  if (bank < base) return `Below daily limit (${(bank / base * 100).toFixed(1)}%)`;
  if (bank === base) return "At daily limit";
  const ratio = (bank / base).toFixed(2);
  return `Above limit (${ratio}x)`;
}

// Root wallet view (public message)
function progressBar(current, max, size = 14) {
  const safeMax = Math.max(1, max);
  const ratio = current / safeMax; // can exceed 1 (overfill)
  const capped = Math.min(1, ratio);
  const filled = Math.round(capped * size);
  const empty = size - filled;
  const bar = `【${"█".repeat(filled)}${"░".repeat(empty)}】`;
  if (ratio > 1) {
    // Append a small overfill indicator with +X% over
    const overPct = ((ratio - 1) * 100).toFixed(1);
    return `${bar} +${overPct}%`;
  }
  return bar;
}

function buildBalancePayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? getTestingCash(userId) : getCash(userId)) || 0;
  const mult = getUserModifier(userId) || 1.0;
  const bank = getBank(userId) || 0;
  const base = getBaseLimit();
  const { getProgress } = require("../utils/depositProgress");
  const prog = getProgress(userId);
  const used = prog.amount;
  const bar = progressBar(used, base);
  const over = used > base;
  const embed = new EmbedBuilder()
    .setTitle("💳 Wallet & Bank")
    .setColor(bankColor(bank, base))
    .addFields(
      { name: "Cash", value: `**$${cash.toLocaleString()}**`, inline: true },
      { name: "Bank", value: `**$${bank.toLocaleString()}**`, inline: true },
      { name: "Multiplier", value: `${mult.toFixed(2)}x`, inline: true }
    )
  .addFields({ name: "Daily Deposit Progress", value: `${bar}\n$${used.toLocaleString()}/$${base.toLocaleString()}${over ? " ⚠️" : ""}` })
    .setFooter({ text: "Deposit to grow your bank. Taxes apply above the limit." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bank:menu:deposit").setLabel("Deposit").setEmoji("🏦").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("bank:menu:withdraw").setLabel("Withdraw").setEmoji("💵").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function buildDepositMenuPayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? getTestingCash(userId) : getCash(userId)) || 0;
  const bank = getBank(userId) || 0;
  const base = getBaseLimit();
  // thresholds removed per new spec; allow overfill display only
  const { getProgress } = require("../utils/depositProgress");
  const prog = getProgress(userId);
  const used = prog.amount;
  const resetAt = prog.resetAt;
  const bar = progressBar(used, base);
  const over = used > base;
  const lines = [
    `**Cash:** $${cash.toLocaleString()} • **Bank:** $${bank.toLocaleString()}`,
    `Daily Limit: $${base.toLocaleString()}`,
    `${bar} $${used.toLocaleString()}/$${base.toLocaleString()}${over ? " ⚠️" : ""}`
  ];
  if (resetAt) {
    lines.push(`⏰ Resets: <t:${Math.floor(resetAt/1000)}:R>`);
  }
  if (bank >= base) {
    lines.push(bank === base ? "At limit: further deposits will incur tax." : "Warning: Above limit – deposits incur heavy progressive tax.");
  }
  const embed = new EmbedBuilder()
    .setTitle("🏦 Deposit Menu")
    .setColor(bankColor(bank, base))
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Choose Deposit Amount or Deposit Max. Back returns to Wallet." });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bank:deposit:amount").setLabel("Deposit Amount").setEmoji("📝").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bank:deposit:max").setLabel("Deposit Max").setEmoji("📈").setStyle(bank >= base ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId("bank:back").setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function buildWithdrawMenuPayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? getTestingCash(userId) : getCash(userId)) || 0;
  const bank = getBank(userId) || 0;
  const base = getBaseLimit();
  const lines = [
    `**Cash:** $${cash.toLocaleString()} • **Bank:** $${bank.toLocaleString()}`,
    "Withdrawals have no penalties."
  ];
  const embed = new EmbedBuilder()
    .setTitle("💵 Withdraw Menu")
    .setColor(bankColor(bank, base))
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Choose Withdraw Amount or Withdraw Max. Back returns to Wallet." });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bank:withdraw:amount").setLabel("Withdraw Amount").setEmoji("📝").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bank:withdraw:max").setLabel("Withdraw Max").setEmoji("📉").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("bank:back").setLabel("Back").setEmoji("⬅️").setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

async function handleBalanceCommand(client, message) {
  const payload = buildBalancePayload(message.author.id);
  await message.reply({ ...payload, allowedMentions: { repliedUser: false } }).catch(() => {});
}

module.exports = { 
  handleBalanceCommand,
  buildBalancePayload,
  buildDepositMenuPayload,
  buildWithdrawMenuPayload,
  bankColor,
  buildStatusLine
};
