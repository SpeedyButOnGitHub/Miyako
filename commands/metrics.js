const { createEmbed } = require('../utils/embeds');
const theme = require('../utils/theme');
const { getMetrics } = require('../services/metricsService');

async function handleMetricsCommand(client, message) {
  const m = getMetrics();
  const lines = [
    `Commands: **${m.commands}**`,
    `Interactions: **${m.interactions}**`,
    `Errors: **${m.errors}**`,
    `Last Command: ${m.lastCommandAt ? `<t:${Math.floor(m.lastCommandAt/1000)}:R>` : 'Never'}`
  ];
  const embed = createEmbed({
    title: `${theme.emojis.counter || '🧮'} Metrics`,
    description: lines.join('\n'),
    color: theme.colors.primary
  });
  try { await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }); } catch {}
}
module.exports = { handleMetricsCommand };