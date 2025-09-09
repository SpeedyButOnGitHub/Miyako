const { ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const theme = require('./theme');
const { createEmbed } = require('./embeds');

// Semantic button helpers (navigation, toggle, confirm, danger, disabled display)
function semanticButton(kind, { id, label, emoji, active = false, enabled = true } = {}) {
  let style = ButtonStyle.Secondary;
  switch (kind) {
    case 'nav':
      style = active ? ButtonStyle.Primary : ButtonStyle.Secondary; break;
    case 'confirm':
    case 'success':
      style = ButtonStyle.Success; break;
    case 'danger':
      style = ButtonStyle.Danger; break;
    case 'toggle':
      style = active ? ButtonStyle.Success : ButtonStyle.Secondary; break;
    case 'destructive':
      style = ButtonStyle.Danger; break;
    case 'primary':
      style = ButtonStyle.Primary; break;
    default:
      style = ButtonStyle.Secondary;
  }
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (!enabled) b.setDisabled(true);
  return b;
}

// Row builders for consistent ordering (navigation | pagination | destructive)
function buildNavRow(buttons) {
  const row = new ActionRowBuilder();
  for (const b of buttons) row.addComponents(b);
  return row;
}

function buildToggleRow(toggles) { return buildNavRow(toggles); }

function buildDestructiveRow(buttons) { return buildNavRow(buttons); }

function btn(id, label, style = ButtonStyle.Secondary, emoji, disabled = false) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}

function navBtn(id, label, active, emoji) {
  return btn(id, label, active ? ButtonStyle.Primary : ButtonStyle.Secondary, emoji, false);
}

function toggleModeBtn(id, mode, nextModeLabel, isVC) {
  return btn(id, nextModeLabel, isVC ? ButtonStyle.Success : ButtonStyle.Secondary, isVC ? theme.emojis.vc : theme.emojis.text);
}

function backButton(id = 'back', label = 'Back') {
  return btn(id, label, ButtonStyle.Secondary, theme.emojis.back);
}

function primaryEmbed(title, description) {
  return createEmbed({ title, description: description || '', color: theme.colors.primary });
}

function sectionField(name, value, inline = false) {
  return { name, value, inline };
}

function progressBar(current, max, size = 20, { showNumbers = true, allowOverflow = true, style = 'blocks' } = {}) {
  const safeMax = Math.max(1, max);
  const ratio = current / safeMax;
  const capped = Math.min(1, ratio);
  const filled = Math.round(capped * size);
  const empty = size - filled;
  const fullChar = style === 'bars' ? '█' : '█';
  const emptyChar = style === 'bars' ? '░' : '░';
  let bar = `\`${fullChar.repeat(filled)}${emptyChar.repeat(empty)}\``;
  if (allowOverflow && ratio > 1) bar += ` +${((ratio - 1) * 100).toFixed(1)}%`;
  if (showNumbers) bar += ` ${current}/${max}`;
  return bar;
}

function applyStandardFooter(embed, guild, { testingMode } = { testingMode: false }) {
  try {
    embed.setFooter({ text: `${guild?.name || 'Server'}${testingMode ? ' • Testing Mode' : ''}` });
  } catch {}
  return embed;
}

// Generic pagination display helper for consistency
function paginationLabel(page, totalPages) {
  return `Page ${page}/${totalPages}`;
}

// Apply standard footer + pagination (appended) and optional extra text
function applyFooterWithPagination(embed, guild, { testingMode = false, page = null, totalPages = null, extra = null } = {}) {
  const base = `${guild?.name || 'Server'}${testingMode ? ' • Testing Mode' : ''}`;
  const parts = [base];
  if (page && totalPages) parts.push(paginationLabel(page, totalPages));
  if (extra) parts.push(extra);
  try { embed.setFooter({ text: parts.join(' • ') }); } catch {}
  return embed;
}

// Generic pagination row builder (Prev | Page x/y | Next)
function paginationRow(prefix, page, totalPages) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_prev`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`${prefix}_page`).setLabel(paginationLabel(page, totalPages)).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`${prefix}_next`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );
  return row;
}

// Standard close row (single row with a destructive-style Close button)
function closeRow(id = 'close_menu', label = 'Close') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Danger).setEmoji(theme.emojis.close || '✖')
  );
}

module.exports = { btn, navBtn, toggleModeBtn, backButton, primaryEmbed, sectionField, progressBar, applyStandardFooter, paginationLabel, applyFooterWithPagination, paginationRow, closeRow, semanticButton, buildNavRow, buildToggleRow, buildDestructiveRow };
