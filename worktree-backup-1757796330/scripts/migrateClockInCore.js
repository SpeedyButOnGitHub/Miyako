// Core migration logic extracted for testability.
function migrateClockIn(events) {
  const updated = [];
  for (const ev of events) {
    let changed = false;
    if (!ev.__clockIn || typeof ev.__clockIn !== 'object') { ev.__clockIn = { positions:{}, messageIds:[], lastSentTs:null }; changed = true; }
    const ck = ev.__clockIn;
    if (!ck.positions || typeof ck.positions !== 'object') { ck.positions = {}; changed = true; }
    if (!Array.isArray(ck.messageIds)) { ck.messageIds = []; changed = true; }
    if (!('lastSentTs' in ck)) { ck.lastSentTs = null; changed = true; }
    const KEYS = ['instance_manager','manager','bouncer','bartender','backup','maybe'];
    for (const k of KEYS) { if (!Array.isArray(ck.positions[k])) { ck.positions[k] = []; changed = true; } }
    if (changed) updated.push(ev);
  }
  return updated;
}
module.exports = { migrateClockIn };
