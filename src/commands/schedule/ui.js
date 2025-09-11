const theme = require('../../utils/theme');
const { createEmbed, safeAddField } = require('../../utils/embeds');
const { applyFooterWithPagination, semanticButton, buildNavRow } = require('../../ui');

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function summarizeEvent(ev) {
  const times = (ev.times || []).join(", ") || "–";
  const days = (ev.days || []).map(d => DAY_NAMES[d] || d).join(" ") || "All";
  const clock = (theme.emojis && (theme.emojis.times || theme.emojis.time)) || '🕒';
  const repeat = (theme.emojis && (theme.emojis.repeat || theme.emojis.days)) || '🔁';
  return `${ev.enabled ? (theme.emojis.enable || '✅') : (theme.emojis.disable || '❌')} **${ev.name}**\n${clock} ${times} • ${repeat} ${days}`;
}

function buildMainEmbed(guild, events) {
  const embed = createEmbed({
    title: `${theme.emojis.toggle || '🗓️'} Events Manager`,
    description: events.length ? events.map(summarizeEvent).join("\n\n") : "*No events defined yet.*",
    color: theme.colors.primary
  });
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: `${events.length} event${events.length === 1 ? '' : 's'}` });
  return embed;
}

function buildDetailEmbed(guild, ev) {
  const times = (ev.times || []).length ? ev.times.join(", ") : "(none)";
  const days = (ev.days || []).length ? ev.days.map(d => DAY_NAMES[d] || d).join(", ") : "(none)";
  let msgPreview = ev.message ? (ev.message.length > 300 ? ev.message.slice(0,297)+"..." : ev.message) : "(none)";
  if (ev.messageJSON && typeof ev.messageJSON === 'object') {
    const json = ev.messageJSON;
    if (json.content) {
      msgPreview = `JSON: ${json.content.substring(0,120)}${json.content.length>120?"...":""}`;
    } else if (Array.isArray(json.embeds) && json.embeds.length) {
      const first = json.embeds[0];
      const t = first.title || first.description || '(embed)';
      msgPreview = `JSON Embed: ${String(t).substring(0,120)}${String(t).length>120?"...":""}`;
    } else {
      msgPreview = 'JSON payload';
    }
  }
  const embed = createEmbed({
    title: `${ev.enabled ? theme.emojis.enable : theme.emojis.disable} ${ev.name}`,
    description: ev.description || 'No description provided.',
    color: ev.enabled ? theme.colors.success : theme.colors.danger
  });
  safeAddField(embed, 'Status', ev.enabled ? 'Enabled' : 'Disabled', true);
  safeAddField(embed, 'Type', ev.type || 'multi-daily', true);
  safeAddField(embed, 'Channel', ev.channelId ? `<#${ev.channelId}>` : '(none)', true);
  safeAddField(embed, 'Times', times);
  safeAddField(embed, 'Days', days);
  safeAddField(embed, 'Message', msgPreview);
  applyFooterWithPagination(embed, guild, { page: 1, totalPages: 1, extra: 'Events Manager' });
  return embed;
}

function mainRows(events) {
  return [ buildNavRow([
    semanticButton('success', { id: 'events_create', label: 'Create', emoji: theme.emojis.create }),
    semanticButton('danger', { id: 'events_delete_mode', label: 'Delete', emoji: theme.emojis.delete }),
    semanticButton('primary', { id: 'events_select_mode', label: 'Select', emoji: theme.emojis.events, enabled: !!events.length })
  ]) ];
}

function buildSelectRows(kind, events) {
  const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
  const options = events.slice(0,25).map(e => ({ label: e.name.slice(0,100), value: e.id, description: (e.times||[]).join(' ').slice(0,100), emoji: kind === 'delete' ? theme.emojis.delete : (e.enabled?theme.emojis.enable:theme.emojis.disable) }));
  const rows = [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`events_${kind === 'delete' ? 'delete' : 'select'}`).setPlaceholder(kind==='delete'? 'Select event to delete' : 'Select event...').addOptions(options))
  ];
  return rows;
}

function detailRows(ev) {
  const { buildNavRow, semanticButton } = require('../../ui');
  const row = buildNavRow([
    semanticButton(ev.enabled ? 'danger' : 'success', { id: `events_toggle_${ev.id}`, label: ev.enabled ? 'Disable' : 'Enable', emoji: ev.enabled ? theme.emojis.disable : theme.emojis.enable }),
    semanticButton('primary', { id: `events_edit_${ev.id}`, label: 'Edit', emoji: theme.emojis.edit || theme.emojis.message || '✏️' }),
    semanticButton('nav', { id: `events_notifs_${ev.id}`, label: 'Auto Msgs', emoji: theme.emojis.bell || '🔔' }),
    semanticButton('danger', { id: `events_delete_${ev.id}`, label: 'Delete', emoji: theme.emojis.delete })
  ]);
  return [row];
}

module.exports = {
  DAY_NAMES,
  buildMainEmbed,
  buildDetailEmbed,
  mainRows,
  buildSelectRows,
  detailRows,
};
