// Embed construction utilities moved to src/ui (Phase 2)
const { EmbedBuilder } = require('discord.js');
const { toTitleCase } = require('../utils/text');
const theme = require('./theme');

function createEmbed({ title = null, description = null, color = 'primary', fields = [], footer = null, timestamp = true } = {}) {
  const embed = new EmbedBuilder();
  if (title) embed.setTitle(toTitleCase(title));
  if (description) embed.setDescription(description);
  const resolvedColor = typeof color === 'number' ? color : theme.color(color, theme.colors.neutral);
  embed.setColor(resolvedColor);
  if (Array.isArray(fields) && fields.length) embed.addFields(fields.slice(0, 25));
  if (footer) embed.setFooter(typeof footer === 'string' ? { text: footer } : footer);
  if (timestamp) embed.setTimestamp();
  return embed;
}

function infoEmbed(opts = {}) { return createEmbed({ color: 'primary', ...opts }); }
function successEmbed(opts = {}) { return createEmbed({ color: 'success', ...opts }); }
function warnEmbed(opts = {}) { return createEmbed({ color: 'warning', ...opts }); }
function errorEmbed(opts = {}) { return createEmbed({ color: 'danger', ...opts }); }

function safeAddField(embed, name, value, inline = false) {
  try {
    if (!embed || typeof embed.addFields !== 'function') return embed;
    if (!name || !value) return embed;
    const val = String(value).slice(0, 1024);
    embed.addFields({ name: String(name).slice(0, 256), value: val, inline: !!inline });
  } catch {}
  return embed;
}

function addChunkedField(embed, baseName, text, chunkSize = 1000) {
  if (!text) return embed;
  const chunks = [];
  let current = '';
  for (const line of String(text).split(/\n/)) {
    if ((current + line + '\n').length > chunkSize && current.length) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim().length) chunks.push(current.trim());
  chunks.slice(0, 3).forEach((c, i) => safeAddField(embed, i === 0 ? baseName : `${baseName} (${i + 1})`, c));
  return embed;
}

module.exports = { createEmbed, infoEmbed, successEmbed, warnEmbed, errorEmbed, safeAddField, addChunkedField };
