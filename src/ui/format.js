// Formatting helpers: progress bars, footers, sections
const theme = require('./theme');

function sectionField(name, value, inline=false) { return { name, value, inline }; }
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
function applyStandardFooter(embed, guild, { testingMode } = { testingMode:false }) {
  try { embed.setFooter({ text: `${guild?.name || 'Server'}${testingMode ? ' • Testing Mode' : ''}` }); } catch {}
  return embed;
}
function applyFooterWithPagination(embed, guild, { testingMode=false, page=null, totalPages=null, extra=null } = {}) {
  const base = `${guild?.name || 'Server'}${testingMode ? ' • Testing Mode' : ''}`;
  const parts = [base];
  if (page && totalPages) parts.push(`Page ${page}/${totalPages}`);
  if (extra) parts.push(extra);
  try { embed.setFooter({ text: parts.join(' • ') }); } catch {}
  return embed;
}
module.exports = { sectionField, progressBar, applyStandardFooter, applyFooterWithPagination };
