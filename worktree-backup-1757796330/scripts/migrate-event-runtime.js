// Migration: extract volatile runtime-only fields from events.json into data/private/eventsRuntime.json
// Volatile keys (top-level per event): anchorChannelId, anchorMessageId, __notifMsgs, __clockIn, dynamicBaseContent, any __auto_* markers
// After migration these keys are removed from events.json and preserved in the runtime overlay store.
const fs = require('fs');
const { runtimeFile } = require('../src/utils/paths');
const { setRuntime, getRuntime } = require('../src/utils/eventsRuntimeLog');

function run() {
  const file = runtimeFile('events.json');
  if (!fs.existsSync(file)) { console.log('No events.json found'); return; }
  let raw = fs.readFileSync(file,'utf8');
  try { raw = raw.replace(/,\s*([}\]])/g,'$1'); } catch {}
  let parsed;
  try { parsed = JSON.parse(raw); } catch { console.log('Could not parse events.json'); return; }
  if (!parsed || !Array.isArray(parsed.events)) { console.log('No events to process'); return; }
  let changed = false; let migratedCount = 0;
  parsed.events = parsed.events.map(ev => {
    if (!ev || typeof ev !== 'object') return ev;
    const runtimePatch = {};
    const volatileKeys = ['anchorChannelId','anchorMessageId','__notifMsgs','__clockIn','dynamicBaseContent'];
    for (const k of volatileKeys) {
      if (k in ev) { runtimePatch[k] = ev[k]; delete ev[k]; changed = true; }
    }
    // __auto_* markers
    for (const k of Object.keys(ev)) {
      if (/^__auto_/.test(k)) { runtimePatch[k] = ev[k]; delete ev[k]; changed = true; }
    }
    if (Object.keys(runtimePatch).length) {
      const cur = getRuntime(ev.id) || {}; // merge to preserve existing runtime values
      setRuntime(ev.id, { ...runtimePatch, ...cur });
      migratedCount++;
    }
    return ev;
  });
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
    console.log(`Migrated volatile runtime fields for ${migratedCount} event(s) to data/private/eventsRuntime.json`);
  } else {
    console.log('No volatile runtime fields found to migrate');
  }
}

run();
