#!/usr/bin/env node
// Migration CLI wrapper
const { getEvents, updateEvent } = require('../src/utils/eventsStorage');
const { migrateClockIn } = require('./migrateClockInCore');

function run() {
  const events = getEvents();
  const updated = migrateClockIn(events);
  for (const ev of updated) updateEvent(ev.id, { __clockIn: ev.__clockIn });
  console.log(`Clock-in migration complete. Updated ${updated.length} event(s).`);
}

if (require.main === module) run();
module.exports = { run };

