// Button & row construction utilities migrated from utils/ui.js (Phase 3)
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const theme = require('./theme');
const { toTitleCase } = require('../utils/text');

function semanticButton(kind, { id, label, emoji, active = false, enabled = true } = {}) {
  if (!id) return null;
  if (label && /^(back)$/i.test(label)) return null;
  if (/(:|_)back$/i.test(id)) return null;
  let style = ButtonStyle.Secondary;
  switch (kind) {
    case 'nav': style = active ? ButtonStyle.Primary : ButtonStyle.Secondary; break;
    case 'confirm':
    case 'success': style = ButtonStyle.Success; break;
    case 'danger':
    case 'destructive': style = ButtonStyle.Danger; break;
    case 'toggle': style = active ? ButtonStyle.Success : ButtonStyle.Secondary; break;
    case 'primary': style = ButtonStyle.Primary; break;
    default: style = ButtonStyle.Secondary;
  }
  const cased = toTitleCase(label || '');
  const b = new ButtonBuilder().setCustomId(id).setLabel(cased).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (!enabled) b.setDisabled(true);
  return b;
}

function btn(id, label, style = ButtonStyle.Secondary, emoji, disabled = false) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}
function navBtn(id, label, active, emoji) { return btn(id, label, active ? ButtonStyle.Primary : ButtonStyle.Secondary, emoji, false); }
function toggleModeBtn(id, mode, nextModeLabel, isVC) { return btn(id, nextModeLabel, isVC ? ButtonStyle.Success : ButtonStyle.Secondary, isVC ? theme.emojis.vc : theme.emojis.text); }
function backButton(id='back', label='Back') { return btn(id, label, ButtonStyle.Secondary, theme.emojis.back); }

function buildNavRow(buttons) { const row = new ActionRowBuilder(); for (const b of (buttons||[])) if (b) row.addComponents(b); return row; }
const buildToggleRow = (toggles) => buildNavRow(toggles);
const buildDestructiveRow = (buttons) => buildNavRow(buttons);

function splitButtonsIntoRows(buttons) {
  // Returns an array of ActionRowBuilder each with up to 5 components
  const out = [];
  const comps = (buttons || []).filter(Boolean);
  for (let i = 0; i < comps.length; i += 5) {
    const r = new ActionRowBuilder();
    r.addComponents(...comps.slice(i, i + 5));
    out.push(r);
  }
  return out;
}

function paginationLabel(page, totalPages) { return `Page ${page}/${totalPages}`; }
function paginationRow(prefix, page, totalPages) {
  const row = new ActionRowBuilder();
  row.addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_prev`).setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`${prefix}_page`).setLabel(paginationLabel(page, totalPages)).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`${prefix}_next`).setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
  );
  return row;
}


async function diffEditMessage(target, { embeds, components, content }) {
  try {
    const current = target.embeds || [];
    const curComps = target.components || [];
    const sameEmbeds = JSON.stringify((embeds||[]).map(e=>({ t:e.data?.title, d:e.data?.description, c:e.data?.color }))) === JSON.stringify(current.map(e=>({ t:e.data?.title, d:e.data?.description, c:e.data?.color })));
    const norm = rows => (rows||[]).map(r => (r.components||[]).map(c => ({ id:c.customId, dis:c.data?.disabled, style:c.data?.style, lbl:c.data?.label })).slice(0,25));
    const sameComponents = JSON.stringify(norm(components)) === JSON.stringify(norm(curComps));
    const sameContent = (content ?? target.content) === target.content;
    if (sameEmbeds && sameComponents && sameContent) return false;
    await target.edit({ embeds, components, content });
    return true;
  } catch { return false; }
}

module.exports = { semanticButton, btn, navBtn, toggleModeBtn, backButton, buildNavRow, buildToggleRow, buildDestructiveRow, splitButtonsIntoRows, paginationLabel, paginationRow, diffEditMessage };
