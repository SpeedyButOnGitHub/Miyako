const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildRootEmbed, buildCategorySelect, buildCategoryEmbed, buildSettingEmbed, buildSettingSelect, buildSettingRow } = require('./render');
const { openCategory, openSetting, handleButton, handleModal } = require('./handlers');
const { OWNER_ID } = require('../moderation/permissions');
const { config, saveConfig } = require('../../utils/storage');
const { logConfigChange } = require('../../utils/configLogs');

async function handleConfigMenuCommand(message) {
  if (String(message.author.id) !== String(OWNER_ID)) {
    await message.reply({ content: 'Only the Owner can use this.' });
    return;
  }
  const embed = buildRootEmbed();
  const categoryRow = buildCategorySelect();
  const sent = await message.channel.send({ embeds: [embed], components: [categoryRow] });

  const collector = sent.createMessageComponentCollector({ time: 5 * 60 * 1000 });

  collector.on('collect', async (interaction) => {
    try {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'This menu is not for you.', ephemeral: true });
      }
      if (interaction.isButton()) {
        // New uniform navigation
        if (interaction.customId.startsWith('cfg:cat:')) {
          const categoryName = interaction.customId.split(':')[2];
          // Replace components with category row only
          return interaction.update({ embeds: [buildCategoryEmbed(categoryName)], components: [buildSettingSelect(categoryName)] });
        }
        if (interaction.customId.startsWith('cfg:set:')) {
          const [, , categoryName, settingName] = interaction.customId.split(':');
          // Replace single row of buttons for setting
          return interaction.update({ embeds: [buildSettingEmbed(categoryName, settingName)], components: [buildSettingRow(categoryName, settingName)] });
        }
        if (interaction.customId.startsWith('cfg:back:')) {
          const part = interaction.customId.split(':')[2];
          if (part === 'root') {
            return interaction.update({ embeds: [buildRootEmbed()], components: [buildCategorySelect()] });
          }
          const categoryName = part;
          return interaction.update({ embeds: [buildCategoryEmbed(categoryName)], components: [buildSettingSelect(categoryName)] });
        }
        // Legacy IDs still supported
        if (interaction.customId.startsWith('config:')) {
          const parts = interaction.customId.split(':').slice(1); // category:setting:action
          return handleButton(interaction, parts);
        }
        // Per-setting mode toggles for Channels
        if (interaction.customId.startsWith('settingMode_')) {
          const [, cat, key, mode] = interaction.customId.split('_');
          if (cat === 'Sniping' && key === 'ChannelList') {
            const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
            if (config.snipeMode !== newMode) { config.snipeMode = newMode; await saveConfig(); try { await logConfigChange(interaction.client, { user: interaction.user, change: `Set Sniping mode to ${newMode}.` }); } catch {} }
            return interaction.update({
              embeds: [buildSettingEmbed('Sniping', 'ChannelList')],
              components: [buildSettingRow('Sniping', 'ChannelList')]
            });
          }
          if (cat === 'Leveling' && key === 'LevelingChannels') {
            const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
            if (config.levelingMode !== newMode) { config.levelingMode = newMode; await saveConfig(); try { await logConfigChange(interaction.client, { user: interaction.user, change: `Set Leveling mode to ${newMode}.` }); } catch {} }
            return interaction.update({
              embeds: [buildSettingEmbed('Leveling', 'LevelingChannels')],
              components: [buildSettingRow('Leveling', 'LevelingChannels')]
            });
          }
          return;
        }
        if (interaction.customId.startsWith('back_category_')) {
          const categoryName = interaction.customId.replace('back_category_', '');
          return interaction.update({ embeds: [buildCategoryEmbed(categoryName)], components: [buildSettingSelect(categoryName)] });
        }
      } else if (interaction.isModalSubmit()) {
        return handleModal(interaction);
      }
    } catch (err) {
      console.error('[configMenu] interaction error:', err);
      if (!interaction.replied) {
        await interaction.reply({ content: 'Error handling interaction.', ephemeral: true });
      }
    }
  });

  collector.on('end', async () => {
    try { await sent.edit({ components: [] }); } catch {}
  });
}

module.exports = { handleConfigMenuCommand };
