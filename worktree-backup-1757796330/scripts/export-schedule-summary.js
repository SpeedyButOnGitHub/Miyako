// Emit a quick schedule summary (counts and next runs) into schedule_summary.txt
const fs = require('fs');
const path = require('path');
const { cfgPath } = require('../src/utils/paths');

function formatTs(ms) {
  if (!ms || !Number.isFinite(ms)) return 'n/a';
  const s = Math.floor(ms / 1000);
  return `<t:${s}:F> (<t:${s}:R>)`;
}

function main() {
  const eventsFile = cfgPath('events.json');
  const schedulesFile = cfgPath('schedules.json');
  let events = [];
  let schedules = [];
  try {
    const ej = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    events = Array.isArray(ej) ? ej : (Array.isArray(ej?.events) ? ej.events : []);
  } catch {}
  try {
    const sj = JSON.parse(fs.readFileSync(schedulesFile, 'utf8'));
    schedules = Array.isArray(sj) ? sj : (Array.isArray(sj?.schedules) ? sj.schedules : []);
  } catch {}

  const lines = [];
  lines.push('===== AUTO MESSAGES (events.json) =====');
  lines.push(`Total events: ${events.length}`);
  for (const ev of events) {
    const next = ev.__nextRunAt || ev.nextRunAt || null;
    const ch = ev.channelId || 'unknown';
    lines.push(`- ${ev.name || ev.id || '(unnamed)'} -> #${ch} next: ${formatTs(next)}`);
  }
  lines.push('');

  lines.push('===== SCHEDULES (schedules.json) =====');
  lines.push(`Total schedules: ${schedules.length}`);
  for (const sc of schedules) {
    const next = sc.__nextRunAt || sc.nextRunAt || null;
    const ch = sc.channelId || 'unknown';
    lines.push(`- ${sc.name || sc.id || '(unnamed)'} -> #${ch} next: ${formatTs(next)}`);
  }
  lines.push('');

  const out = path.join(path.dirname(eventsFile), '..', 'schedule_summary.txt');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(`[export-schedule-summary] wrote ${out}`);
}

if (require.main === module) main();
