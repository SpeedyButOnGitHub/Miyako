const { ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const theme = require('./theme');

function btn(id, label, style, emoji, disabled=false) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}

function primaryEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description || '').setColor(theme.colors.primary);
}

function sectionField(name, value, inline=false) {
  return { name, value, inline };
}

module.exports = { btn, primaryEmbed, sectionField };
