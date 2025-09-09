const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { createEmbed, safeAddField } = require('../utils/embeds');
const theme = require("../utils/theme");
const { progressBar: sharedProgressBar, applyStandardFooter, semanticButton, buildNavRow } = require("../utils/ui");
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

  const row = buildNavRow([
    semanticButton('nav', { id: 'bank:menu:deposit', label: 'Deposit', emoji: theme.emojis.deposit }),
    semanticButton('primary', { id: 'bank:menu:withdraw', label: 'Withdraw', emoji: theme.emojis.withdraw })
  ]);
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
  const row = buildNavRow([
    semanticButton('nav', { id: 'bank:deposit:amount', label: 'Deposit', emoji: theme.emojis.deposit }),
    semanticButton('nav', { id: 'bank:deposit:max', label: 'Deposit Max', emoji: theme.emojis.deposit }),
    semanticButton('nav', { id: 'bank:back', label: 'Back', emoji: theme.emojis.back })
  ]);
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
  const row = buildNavRow([
    semanticButton('nav', { id: 'bank:withdraw:amount', label: 'Withdraw Amount', emoji: theme.emojis.withdraw }),
    semanticButton('nav', { id: 'bank:withdraw:max', label: 'Withdraw Max', emoji: theme.emojis.withdraw }),
    semanticButton('nav', { id: 'bank:back', label: 'Back', emoji: theme.emojis.back })
  ]);
  return { embeds: [embed], components: [row] };
}

async function handleBalanceCommand(client, message) {
  const payload = buildBalancePayload(message.author.id);
  try {
    const { activeDrops } = require('../utils/cashDrops');
    const dropActive = activeDrops && Array.from(activeDrops.values()).some(d => d && !d.claimedBy && d.expiresAt > Date.now());
    if (dropActive) {
      const BROADCAST_CHANNEL_ID = '1232701768987578462';
      const channel = await client.channels.fetch(BROADCAST_CHANNEL_ID).catch(()=>null);
      let linkMsg = null;
      if (channel && channel.send) {
        // Public broadcast with ping
        linkMsg = await channel.send({ content: `🔍 Balance Check: <@${message.author.id}>`, ...payload, allowedMentions:{ users:[message.author.id] } }).catch(()=>null);
      }
      // Ephemeral redirect style reply: minimal message linking to broadcast
      const jumpLink = linkMsg ? `https://discord.com/channels/${linkMsg.guildId}/${linkMsg.channelId}/${linkMsg.id}` : null;
      await message.reply({ content: jumpLink ? `Balance posted here → ${jumpLink}` : 'Balance posted.', allowedMentions:{ repliedUser:false } }).catch(()=>{});
      return;
    }
  } catch {}
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
