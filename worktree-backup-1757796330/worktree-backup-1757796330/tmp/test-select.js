const { StringSelectMenuBuilder } = require('discord.js');
function tryAdd(opts) {
  try {
    const sel = new StringSelectMenuBuilder().setCustomId('test').setPlaceholder('ph');
    sel.addOptions(opts);
    console.log('OK');
    console.log(JSON.stringify(sel.toJSON(), null, 2));
  } catch (e) {
    console.error('ERR', e && e.message);
    try { console.dir(e, { depth: null }); } catch (d) { console.error('dir failed', d); }
    if (e && e.stack) console.error(e.stack);
  }
}

const sample = [
  { label: 'at start (on) #1', value: '1', description: '<@&1380303846877696153>' },
  { label: '20 hours before (on) #2', value: '2', description: '' }
];
// Apply same sanitizer as notifSelectRows
const sanitizeOpt = (o) => {
  try {
    const label = (o.label || '').toString().slice(0,100);
    let value = (o.value === undefined || o.value === null) ? '' : String(o.value).slice(0,100);
    if (!value) value = label || 'none';
    const rawDesc = (o.description || '').toString().slice(0,90);
    const description = rawDesc.length ? rawDesc : undefined;
    const out = { label, value };
    if (description !== undefined) out.description = description;
    return out;
  } catch (e) { return { label: 'Option', value: 'none' }; }
};

const sanitized = sample.map(sanitizeOpt);
console.log('Sanitized:', JSON.stringify(sanitized, null, 2));
tryAdd(sanitized);
