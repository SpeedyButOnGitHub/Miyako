// Canonical Staff Clock-In embed template & renderer.
const { config } = require('./storage');

const BASE_TEMPLATE = Object.freeze({
  title: '🕒 Staff Clock In — {{EVENT_NAME}}',
  description: 'Please select your role below to clock in.\n\n**Instance Manager** is responsible for opening, managing and closing an instance.',
  color: 3447003,
  fields: [
    { name: '📝 Instance Manager (1 slot)', value: '{{IM_VALUE}}', inline: false },
    { name: '🛠️ Manager',   value: '{{MANAGER}}',   inline: true },
    { name: '🛡️ Bouncer',   value: '{{BOUNCER}}',   inline: true },
    { name: '🍸 Bartender', value: '{{BARTENDER}}', inline: true },
    { name: '🎯 Backup',    value: '{{BACKUP}}',    inline: true },
    { name: '⏳ Maybe / Late', value: '{{MAYBE}}', inline: false },
    { name: 'Eligible roles', value: '<@&1375995842858582096>, <@&1380277718091829368>, <@&1380323145621180466>, <@&1375958480380493844>' }
  ],
  footer: { text: 'Late Night Hours | Staff clock in for {{EVENT_NAME}}' }
});

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function getAutoNextRole(val) { return typeof val === 'string' ? val : (val && typeof val === 'object' ? val.role : null); }
function fmtMentions(arr=[], roleKey=null, autoNextMap=null) {
  if (!Array.isArray(arr) || arr.length === 0) return '*None*';
  const s = arr.map(id=>{
    const starred = autoNextMap && roleKey && getAutoNextRole(autoNextMap[id]) === roleKey ? '*' : '';
    return `<@${id}>${starred}`;
  }).join(', ');
  return config.testingMode ? s.replace(/<@&?\d+>\*?/g, m=>`\`${m}\``) : s;
}

function buildClockInEmbed(ev) {
  const tpl = clone(BASE_TEMPLATE);
  const name = ev.name || 'Event';
  const positions = (ev.__clockIn && ev.__clockIn.positions) || {};
  const autoNext = (ev.__clockIn && ev.__clockIn.autoNext) || null;
  const im = positions.instance_manager || [];
  tpl.title = tpl.title.replace(/{{EVENT_NAME}}/g, name);
  tpl.footer.text = tpl.footer.text.replace(/{{EVENT_NAME}}/g, name);
  tpl.fields = tpl.fields.map(f => {
    const out = { ...f };
    if (out.value && typeof out.value === 'string') {
      out.value = out.value
        .replace('{{IM_VALUE}}', `${im.length} / 1\n${fmtMentions(im,'instance_manager',autoNext)}`)
        .replace('{{MANAGER}}', fmtMentions(positions.manager,'manager',autoNext))
        .replace('{{BOUNCER}}', fmtMentions(positions.bouncer,'bouncer',autoNext))
        .replace('{{BARTENDER}}', fmtMentions(positions.bartender,'bartender',autoNext))
        .replace('{{BACKUP}}', fmtMentions(positions.backup,'backup',autoNext))
        .replace('{{MAYBE}}', fmtMentions(positions.maybe,'maybe',autoNext));
    }
    return out;
  });
  // Add legend if any starred users
  try {
    if (autoNext && Object.keys(autoNext).length) {
      const anyStarred = Object.keys(autoNext).some(uid => {
        const assignedRole = getAutoNextRole(autoNext[uid]);
        return assignedRole && Object.entries(positions).some(([rk, arr]) => Array.isArray(arr) && arr.includes(uid) && assignedRole === rk);
      });
      if (anyStarred && tpl.fields.length < 25) {
        tpl.fields.push({ name: 'Legend', value: '* = Auto-registered for next clock-in', inline: false });
      }
    }
  } catch {}
  return tpl;
}

module.exports = { buildClockInEmbed, BASE_TEMPLATE };
