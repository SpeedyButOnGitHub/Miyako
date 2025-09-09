const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEmbed, safeAddField } = require('../utils/embeds');
const theme = require("../utils/theme");
const { progressBar: sharedProgressBar, applyStandardFooter } = require("../utils/ui");
const { cash: cashUtils } = require("../services/economyService");
const { bank: bankUtils } = require("../services/economyService");
const { getUserModifier } = require("../services/levelingService");

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
const progressBar = (current, max, size = 14) => sharedProgressBar(current, max, size, { allowOverflow: true, showNumbers: false });

function buildBalancePayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? cashUtils.getTestingCash(userId) : cashUtils.getCash(userId)) || 0;
  const mult = getUserModifier(userId) || 1.0;
  const bank = bankUtils.getBank(userId) || 0;
  const base = bankUtils.getBaseLimit();
  const { getProgress } = require("../utils/depositProgress");
  const prog = getProgress(userId);
  const used = prog.amount;
  const bar = progressBar(used, base);
  const over = used > base;
  const embed = createEmbed({
    title: `${theme.emojis.bank} Wallet & Bank`,
    color: bankColor(bank, base)
  });
  safeAddField(embed, 'Cash', `**$${cash.toLocaleString()}**`, true);
  safeAddField(embed, 'Bank', `**$${bank.toLocaleString()}**`, true);
  safeAddField(embed, 'Multiplier', `${mult.toFixed(2)}x`, true);
  safeAddField(embed, 'Daily Deposit Progress', `${bar}\n$${used.toLocaleString()}/$${base.toLocaleString()}${over ? ' ⚠️' : ''}`);
  applyStandardFooter(embed, null, { testingMode: config.testingMode });
  embed.setFooter({ text: `Deposit to grow your bank${config.testingMode ? ' • Testing Mode' : ''}. Taxes apply above the limit.` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bank:menu:deposit").setLabel("Deposit").setEmoji(theme.emojis.deposit).setStyle(ButtonStyle.Secondary),
    // Withdraw button requested blue (Primary)
    new ButtonBuilder().setCustomId("bank:menu:withdraw").setLabel("Withdraw").setEmoji(theme.emojis.withdraw).setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

function buildDepositMenuPayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? cashUtils.getTestingCash(userId) : cashUtils.getCash(userId)) || 0;
  const bank = bankUtils.getBank(userId) || 0;
  const base = bankUtils.getBaseLimit();
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
  const embed = createEmbed({
    title: `${theme.emojis.deposit} Deposit Menu`,
    description: lines.join('\n'),
    color: bankColor(bank, base)
  });
  applyStandardFooter(embed, null, { testingMode: config.testingMode });
  embed.setFooter({ text: `Choose Deposit Amount or Deposit Max. Back returns to Wallet.${config.testingMode ? ' • Testing Mode' : ''}` });
  const row = new ActionRowBuilder().addComponents(
    // Simplify labels & make gray per theme; remove pencil/edit emoji
    new ButtonBuilder().setCustomId("bank:deposit:amount").setLabel("Deposit").setEmoji(theme.emojis.deposit).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bank:deposit:max").setLabel("Deposit Max").setEmoji(theme.emojis.deposit).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bank:back").setLabel("Back").setEmoji(theme.emojis.back).setStyle(ButtonStyle.Secondary)
  );
  return { embeds: [embed], components: [row] };
}

function buildWithdrawMenuPayload(userId) {
  const { config } = require("../utils/storage");
  const cash = (config.testingMode ? cashUtils.getTestingCash(userId) : cashUtils.getCash(userId)) || 0;
  const bank = bankUtils.getBank(userId) || 0;
  const base = bankUtils.getBaseLimit();
  const lines = [
    `**Cash:** $${cash.toLocaleString()} • **Bank:** $${bank.toLocaleString()}`,
    "Withdrawals have no penalties."
  ];
  const embed = createEmbed({
    title: `${theme.emojis.withdraw} Withdraw Menu`,
    description: lines.join('\n'),
    color: bankColor(bank, base)
  });
  applyStandardFooter(embed, null, { testingMode: config.testingMode });
  embed.setFooter({ text: `Choose Withdraw Amount or Withdraw Max. Back returns to Wallet.${config.testingMode ? ' • Testing Mode' : ''}` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bank:withdraw:amount").setLabel("Withdraw Amount").setEmoji(theme.emojis.withdraw).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bank:withdraw:max").setLabel("Withdraw Max").setEmoji(theme.emojis.withdraw).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("bank:back").setLabel("Back").setEmoji(theme.emojis.back).setStyle(ButtonStyle.Secondary)
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
