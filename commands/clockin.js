const { createEmbed, safeAddField } = require('../utils/embeds');
const theme = require('../utils/theme');
const { getEvents } = require('../utils/eventsStorage');
const { OWNER_ID } = require('./moderation/permissions');

function buildClockInStateEmbed() {
  const events = getEvents();
  const clockEvents = events.filter(e => e.__clockIn && e.__clockIn.positions);
  const embed = createEmbed({
    title: '🕒 Clock-In State',
    description: clockEvents.length ? `${clockEvents.length} event(s) with active clock-in state.` : 'No clock-in state found.',
    color: theme.colors.primary
  });
  for (const ev of clockEvents.slice(0, 10)) { // cap to avoid overlong embed
    const pos = ev.__clockIn.positions || {};
    const roles = ['instance_manager','manager','bouncer','bartender','backup','maybe'];
    const lines = [];
    let total = 0;
    for (const r of roles) {
      const arr = Array.isArray(pos[r]) ? pos[r] : [];
      if (!arr.length) continue;
      total += arr.length;
      const label = r.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
      lines.push(`${label}: ${arr.map(id=>`<@${id}>`).join(', ')}`.slice(0, 250));
    }
    if (!lines.length) lines.push('(empty)');
    const lastSent = ev.__clockIn.lastSentTs ? `<t:${Math.floor(ev.__clockIn.lastSentTs/1000)}:R>` : '—';
    lines.push(`Last Msg: ${lastSent}`);
    safeAddField(embed, ev.name || `Event ${ev.id}`, lines.join('\n').slice(0, 1024));
  }
  if (clockEvents.length > 10) {
    safeAddField(embed, 'Note', `+${clockEvents.length - 10} more event(s) truncated.`);
  }
  return embed;
}

async function handleClockInStateCommand(client, message) {
  if (message.author.id !== OWNER_ID) return; // restrict
  try {
    const embed = buildClockInStateEmbed();
    await message.reply({ embeds:[embed], allowedMentions:{ repliedUser:false } });
  } catch (e) {
    await message.reply({ content: 'Failed to build clock-in state: ' + (e.message||e), allowedMentions:{ repliedUser:false } }).catch(()=>{});
  }
}

module.exports = { handleClockInStateCommand };
