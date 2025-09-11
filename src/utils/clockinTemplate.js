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
function fmtMentions(arr=[]) {
  if (!Array.isArray(arr) || arr.length === 0) return '*None*';
  const s = arr.map(id=>`<@${id}>`).join(', ');
  return config.testingMode ? s.replace(/<@&?\d+>/g, m=>`\`${m}\``) : s;
}

function buildClockInEmbed(ev) {
  const tpl = clone(BASE_TEMPLATE);
  const name = ev.name || 'Event';
  const positions = (ev.__clockIn && ev.__clockIn.positions) || {};
  const im = positions.instance_manager || [];
  tpl.title = tpl.title.replace(/{{EVENT_NAME}}/g, name);
  tpl.footer.text = tpl.footer.text.replace(/{{EVENT_NAME}}/g, name);
  tpl.fields = tpl.fields.map(f => {
    const out = { ...f };
    if (out.value && typeof out.value === 'string') {
      out.value = out.value
        .replace('{{IM_VALUE}}', `${im.length} / 1\n${fmtMentions(im)}`)
        .replace('{{MANAGER}}', fmtMentions(positions.manager))
        .replace('{{BOUNCER}}', fmtMentions(positions.bouncer))
        .replace('{{BARTENDER}}', fmtMentions(positions.bartender))
        .replace('{{BACKUP}}', fmtMentions(positions.backup))
        .replace('{{MAYBE}}', fmtMentions(positions.maybe));
    }
    return out;
  });
  return tpl;
}

module.exports = { buildClockInEmbed, BASE_TEMPLATE };
