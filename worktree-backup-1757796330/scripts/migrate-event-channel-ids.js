// Migration: extract channelId fields from events.json into data/private/channelIds.json
const fs = require('fs');
const { runtimeFile, dataDir } = require('../src/utils/paths');
const { recordEventChannel } = require('../src/utils/channelIdLog');

function run() {
  const file = runtimeFile('events.json');
  if (!fs.existsSync(file)) { console.log('No events.json found'); return; }
  let raw = fs.readFileSync(file,'utf8');
  try { raw = raw.replace(/,\s*([}\]])/g,'$1'); } catch {}
  let parsed;
  try { parsed = JSON.parse(raw); } catch { console.log('Could not parse events.json'); return; }
  if (!parsed || !Array.isArray(parsed.events)) { console.log('No events to process'); return; }
  let changed = false;
  parsed.events = parsed.events.map(ev => {
    if (ev && ev.channelId) {
      recordEventChannel(ev.id, ev.channelId);
      const { channelId, ...rest } = ev; changed = true; return rest;
    }
    return ev;
  });
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
    console.log('Migrated channelId fields to data/private/channelIds.json');
  } else {
    console.log('No channelId fields found to migrate');
  }
}

run();