const { ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder } = require('discord.js');
const theme = require('./theme');
const { createEmbed } = require('./embeds');
const { toTitleCase } = require('./text');

// Central toggle state registry (boolean / mode) for consistent UI + future automation.
// Each entry: { key, getter:()=>value, kind:'boolean'|'mode', on?:()=>bool }
const toggleRegistry = [];
function registerToggle(def) {
  if (!def || !def.key || typeof def.getter !== 'function') return;
  if (toggleRegistry.find(t => t.key === def.key)) return; // dedupe
  toggleRegistry.push(def);
}
function getToggleState(key) {
  const t = toggleRegistry.find(x => x.key === key);
  if (!t) return null;
  try {
    const v = t.getter();
    if (t.kind === 'boolean') return { value: !!v, on: !!v };
    if (t.kind === 'mode') return { value: v, on: typeof t.on === 'function' ? !!t.on(v) : !!v };
    return { value: v };
  } catch { return null; }
}

// Unified visual mapping for a toggle state
function getToggleVisual(on) {
  return {
    emoji: on ? (theme.emojis.enable || '✅') : (theme.emojis.disable || '❌'),
    color: on ? theme.colors.success : theme.colors.neutral,
    prefix: on ? '✅' : '❌'
  };
}

// Semantic button helpers (navigation, toggle, confirm, danger, disabled display)
function semanticButton(kind, { id, label, emoji, active = false, enabled = true } = {}) {
  if (!id) return null;
  // Suppress legacy Back buttons per new UX (no explicit back navigation)
  if (label && /^(back)$/i.test(label)) return null;
  if (/(:|_)back$/i.test(id)) return null;
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
  // Auto title-case labels universally
  const cased = toTitleCase(label || '');
  const b = new ButtonBuilder().setCustomId(id).setLabel(cased).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (!enabled) b.setDisabled(true);
  return b;
}

// Row builders for consistent ordering (navigation | pagination | destructive)
function buildNavRow(buttons) {
  const row = new ActionRowBuilder();
  for (const b of (buttons||[])) { if (b) row.addComponents(b); }
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

// Toggle embed coloration helper (ON -> success / OFF -> neutral) + indicator prefix
function applyToggleVisual(embed, { on } = { on: false }) {
  try {
    if (!embed || typeof embed.setColor !== 'function') return embed;
    const visual = getToggleVisual(on);
    embed.setColor(visual.color);
    if (embed.data && embed.data.title) {
      const t = embed.data.title.replace(/^([🔴🟢✅❌]\s*)*/, '');
      embed.setTitle(`${visual.prefix} ${t}`);
    }
  } catch {}
  return embed;
}

// Shared builder for setting embeds (category + key + dynamic state) with lastUpdated metadata.
// opts: { title, description, current, toggleKey }
function buildSettingEmbedUnified({ title, description, current, toggleKey, lastUpdatedTs } = {}) {
  const e = createEmbed({ title, description, color: theme.colors.neutral, timestamp: true });
  if (current) e.addFields({ name: 'Current', value: current });
  if (toggleKey) {
    const st = getToggleState(toggleKey);
    if (st && typeof st.on === 'boolean') applyToggleVisual(e, { on: st.on });
  }
  if (lastUpdatedTs) {
    const rel = Math.floor(lastUpdatedTs/1000);
    e.setFooter({ text: `Last Updated: <t:${rel}:R>` });
  }
  return e;
}

module.exports = { btn, navBtn, toggleModeBtn, backButton, primaryEmbed, sectionField, progressBar, applyStandardFooter, paginationLabel, applyFooterWithPagination, paginationRow, closeRow, semanticButton, buildNavRow, buildToggleRow, buildDestructiveRow, toTitleCase, applyToggleVisual, getToggleVisual, registerToggle, getToggleState, buildSettingEmbedUnified };
// Diff-aware message updater to avoid redundant edits (performance + rate limit friendliness)
async function diffEditMessage(target, { embeds, components, content }) {
  try {
    const current = target.embeds || [];
    const curComps = target.components || [];
    const sameEmbeds = JSON.stringify((embeds||[]).map(e=>({ t:e.data?.title, d:e.data?.description, c:e.data?.color }))) === JSON.stringify(current.map(e=>({ t:e.data?.title, d:e.data?.description, c:e.data?.color })));
    const norm = rows => (rows||[]).map(r => (r.components||[]).map(c => ({ id:c.customId, dis:c.data?.disabled, style:c.data?.style, lbl:c.data?.label })).slice(0,25));
    const sameComponents = JSON.stringify(norm(components)) === JSON.stringify(norm(curComps));
    const sameContent = (content ?? target.content) === target.content;
    if (sameEmbeds && sameComponents && sameContent) return false; // no-op
    await target.edit({ embeds, components, content });
    return true;
  } catch { return false; }
}

module.exports.diffEditMessage = diffEditMessage;
