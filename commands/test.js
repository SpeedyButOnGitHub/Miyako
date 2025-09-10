const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require("discord.js");
const { semanticButton, buildNavRow } = require('../utils/ui');
// Jest placeholder (ignored at runtime). Keeps test suite from failing on empty file import.
if (process.env.JEST_WORKER_ID !== undefined) {
  describe('test command placeholder', () => {
    it('loads module', () => {
      expect(true).toBe(true);
    });
  });
}
const { OWNER_ID } = require("../src/commands/moderation/permissions");
const { config, saveConfig } = require("../utils/storage");
const { TEST_LOG_CHANNEL } = require("../utils/logChannels");
const { spawnTestDrop } = require("../utils/cashDrops");
const { clearTestingCash, getTestingCash } = require("../utils/cash");
const theme = require("../utils/theme");
const { createEmbed, safeAddField } = require('../utils/embeds');
const ActiveMenus = require("../utils/activeMenus");

const CATEGORY_ROOT = "root";

function buildRootEmbed() {
  const embed = createEmbed({
    title: '🧪 Test Console',
    description: 'Pick a category to test features in a safe sandbox that does not affect production data.',
    color: theme.colors.primary
  });
  safeAddField(embed, 'General', 'Warnings, Logs, Member events (placeholder)');
  safeAddField(embed, 'Events', 'Economy, Cash Drops');
  embed.setFooter({ text: `Testing Mode: ${config.testingMode ? 'ON' : 'OFF'}` });
  return embed;
}

function rootRows() {
  return [ buildNavRow([
    semanticButton('primary', { id: 'test_general', label: 'General', emoji: '🧰' }),
    semanticButton('primary', { id: 'test_events', label: 'Events', emoji: '🎟️' }),
    semanticButton(config.testingMode ? 'danger' : 'success', { id: 'test_toggle', label: config.testingMode ? 'Disable' : 'Enable', emoji: '🧪' }),
    semanticButton('danger', { id: 'test_close', label: 'Close', emoji: theme.emojis.close || '✖' })
  ]) ];
}

function buildEventsEmbed() {
  const embed = createEmbed({ title: '🎟️ Test: Events', description: 'Choose an event category to test.', color: theme.colors.neutral });
  safeAddField(embed, 'Economy', 'Cash Drops');
  return embed;
}

function eventsRows() {
  return [ buildNavRow([
    semanticButton('primary', { id: 'test_events_economy', label: 'Economy', emoji: '💰' }),
    semanticButton('nav', { id: 'test_back_root', label: 'Back', emoji: '⬅️' }),
    semanticButton('danger', { id: 'test_close', label: 'Close', emoji: theme.emojis.close || '✖' })
  ]) ];
}

function buildEconomyEmbed() {
  const bal = getTestingCash(OWNER_ID);
  const embed = createEmbed({
    title: '💰 Test: Economy — Cash Drops',
    description: 'Spawn a test cash drop in the testing channel and try claiming it.\nTest-mode drops and balances are sandboxed and do not affect real cash.',
    color: theme.colors.primary
  });
  safeAddField(embed, 'Your test balance', `$${bal.toLocaleString()}`, true);
  return embed;
}

function economyRows() {
  return [ buildNavRow([
    semanticButton('primary', { id: 'test_econ_spawn', label: 'Spawn Test Drop', emoji: '🪙' }),
    semanticButton('nav', { id: 'test_econ_clear', label: 'Clear Test Balances', emoji: '🧹' }),
    semanticButton('nav', { id: 'test_back_events', label: 'Back', emoji: '⬅️' }),
    semanticButton('danger', { id: 'test_close', label: 'Close', emoji: theme.emojis.close || '✖' })
  ]) ];
}

async function handleTestCommand(client, message) {
  if (String(message.author.id) !== String(OWNER_ID)) return;
  const sent = await message.channel.send({ embeds: [buildRootEmbed()], components: rootRows() });
  ActiveMenus.registerMessage(sent, { type: 'testmenu', userId: message.author.id, data: { view: 'root' } });
}

ActiveMenus.registerHandler('testmenu', async (interaction, session) => {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your session.', flags: 1<<6 });
  const id = interaction.customId;
  const data = session.data || {}; // { view }

  if (id === 'test_close') {
    try { await interaction.message.edit({ components: [] }); } catch {}
  if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Closed.', flags: 1<<6 });
    return;
  }
  if (id === 'test_toggle') {
    config.testingMode = !config.testingMode; saveConfig();
    return interaction.update({ embeds: [buildRootEmbed()], components: rootRows() });
  }
  if (id === 'test_general') {
    data.view = 'general';
  const embed = createEmbed({ title: '🧰 Test: General', description: 'Placeholder for general test utilities.', color: theme.colors.neutral });
    return interaction.update({ embeds: [embed], components: [ buildNavRow([
      semanticButton('nav', { id: 'test_back_root', label: 'Back', emoji: '⬅️' }),
      semanticButton('danger', { id: 'test_close', label: 'Close', emoji: theme.emojis.close || '✖' })
    ]) ] });
  }
  if (id === 'test_events') {
    data.view = 'events';
    return interaction.update({ embeds: [buildEventsEmbed()], components: eventsRows() });
  }
  if (id === 'test_back_root') {
    data.view = 'root';
    return interaction.update({ embeds: [buildRootEmbed()], components: rootRows() });
  }
  if (id === 'test_back_events') {
    data.view = 'events';
    return interaction.update({ embeds: [buildEventsEmbed()], components: eventsRows() });
  }
  if (id === 'test_events_economy') {
    data.view = 'economy';
    return interaction.update({ embeds: [buildEconomyEmbed()], components: economyRows() });
  }
  if (id === 'test_econ_spawn') {
  if (!config.testingMode) return interaction.reply({ content: 'Enable Testing Mode first.', flags: 1<<6 });
    const modalId = `test_spawn_${Date.now()}`;
    const modal = new ModalBuilder().setCustomId(modalId).setTitle('Spawn Test Cash Drop').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount (optional)').setStyle(TextInputStyle.Short).setRequired(false))
    );
    await interaction.showModal(modal);
    try {
      const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: m => m.customId === modalId && m.user.id === interaction.user.id });
      const raw = submitted.fields.getTextInputValue('amount').trim();
      const num = raw ? Math.max(1, Math.floor(Number(raw) || 0)) : undefined;
      const drop = spawnTestDrop(num);
      const channel = await interaction.client.channels.fetch(TEST_LOG_CHANNEL).catch(() => null);
      if (channel) {
        const embed = createEmbed({
          title: '🧪 Test Cash Drop',
          description: `Type this word to claim it first:\n\n→ \`${drop.word}\``,
          color: theme.colors.warning
        });
        safeAddField(embed, 'Reward', `**$${drop.amount.toLocaleString()}**`, true);
        embed.setFooter({ text: 'First correct message wins (testing).' });
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
  await submitted.reply({ content: `Spawned a test drop of ${drop.amount} in <#${TEST_LOG_CHANNEL}>.`, flags: 1<<6 });
      try { await interaction.message.edit({ embeds: [buildEconomyEmbed()], components: economyRows() }); } catch {}
    } catch {}
    return;
  }
  if (id === 'test_econ_clear') {
    clearTestingCash();
    return interaction.update({ embeds: [buildEconomyEmbed()], components: economyRows() });
  }
});

module.exports = { handleTestCommand };