const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { OWNER_ID } = require("./moderation/permissions");
const { config, saveConfig } = require("../utils/storage");
const { TEST_LOG_CHANNEL } = require("../utils/logChannels");
const { spawnTestDrop } = require("../utils/cashDrops");
const { clearTestingCash, getTestingCash } = require("../utils/cash");
const theme = require("../utils/theme");
const ActiveMenus = require("../utils/activeMenus");

const CATEGORY_ROOT = "root";

function buildRootEmbed() {
  return new EmbedBuilder()
    .setTitle('🧪 Test Console')
    .setColor(theme.colors.primary)
    .setDescription('Pick a category to test features in a safe sandbox that does not affect production data.')
    .addFields(
      { name: 'General', value: 'Warnings, Logs, Member events (placeholder)', inline: false },
      { name: 'Events', value: 'Economy, Cash Drops', inline: false }
    )
    .setFooter({ text: `Testing Mode: ${config.testingMode ? 'ON' : 'OFF'}` });
}

function rootRows() {
  return [ new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('test_general').setLabel('General').setEmoji('🧰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('test_events').setLabel('Events').setEmoji('🎟️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('test_toggle').setLabel(config.testingMode ? 'Disable' : 'Enable').setEmoji('🧪').setStyle(config.testingMode ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('test_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
  )];
}

function buildEventsEmbed() {
  return new EmbedBuilder().setTitle('🎟️ Test: Events').setColor(theme.colors.neutral).setDescription('Choose an event category to test.').addFields({ name: 'Economy', value: 'Cash Drops' });
}

function eventsRows() {
  return [ new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('test_events_economy').setLabel('Economy').setEmoji('💰').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('test_back_root').setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('test_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
  )];
}

function buildEconomyEmbed() {
  const bal = getTestingCash(OWNER_ID);
  return new EmbedBuilder().setTitle('💰 Test: Economy — Cash Drops').setColor(theme.colors.primary)
    .setDescription('Spawn a test cash drop in the testing channel and try claiming it.\nTest-mode drops and balances are sandboxed and do not affect real cash.')
    .addFields({ name: 'Your test balance', value: `$${bal.toLocaleString()}`, inline: true });
}

function economyRows() {
  return [ new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('test_econ_spawn').setLabel('Spawn Test Drop').setEmoji('🪙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('test_econ_clear').setLabel('Clear Test Balances').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('test_back_events').setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('test_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
  )];
}

async function handleTestCommand(client, message) {
  if (String(message.author.id) !== String(OWNER_ID)) return;
  const sent = await message.channel.send({ embeds: [buildRootEmbed()], components: rootRows() });
  ActiveMenus.registerMessage(sent, { type: 'testmenu', userId: message.author.id, data: { view: 'root' } });
}

ActiveMenus.registerHandler('testmenu', async (interaction, session) => {
  if (interaction.user.id !== session.userId) return interaction.reply({ content: 'Not your session.', ephemeral: true });
  const id = interaction.customId;
  const data = session.data || {}; // { view }

  if (id === 'test_close') {
    try { await interaction.message.edit({ components: [] }); } catch {}
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: 'Closed.', ephemeral: true });
    return;
  }
  if (id === 'test_toggle') {
    config.testingMode = !config.testingMode; saveConfig();
    return interaction.update({ embeds: [buildRootEmbed()], components: rootRows() });
  }
  if (id === 'test_general') {
    data.view = 'general';
    const embed = new EmbedBuilder().setTitle('🧰 Test: General').setColor(theme.colors.neutral).setDescription('Placeholder for general test utilities.');
    return interaction.update({ embeds: [embed], components: [ new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('test_back_root').setLabel('Back').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('test_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖') ) ] });
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
    if (!config.testingMode) return interaction.reply({ content: 'Enable Testing Mode first.', ephemeral: true });
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
        const embed = new EmbedBuilder().setTitle('🧪 Test Cash Drop').setColor(theme.colors.warning)
          .setDescription(`Type this word to claim it first:\n\n→ \`${drop.word}\``)
          .addFields({ name: 'Reward', value: `**$${drop.amount.toLocaleString()}**`, inline: true })
          .setFooter({ text: 'First correct message wins (testing).' });
        await channel.send({ embeds: [embed] }).catch(() => {});
      }
      await submitted.reply({ content: `Spawned a test drop of ${drop.amount} in <#${TEST_LOG_CHANNEL}>.`, ephemeral: true });
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