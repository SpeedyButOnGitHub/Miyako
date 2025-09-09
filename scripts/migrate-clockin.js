#!/usr/bin/env node
// Migration: retrofit existing events with modern clock-in structure
// - Ensure __clockIn object exists with positions/messageIds/lastSentTs
// - Rename legacy 'Instance Manager' label references implicitly handled at render time (no stored label change needed)
// - Remove obsolete per-position caps except instance_manager
// Usage: node scripts/migrate-clockin.js

const { getEvents, updateEvent } = require('../utils/eventsStorage');

function run() {
  const events = getEvents();
  let changed = 0;
  for (const ev of events) {
    const ck = ev.__clockIn;
    let need = false;
    if (!ck || typeof ck !== 'object') {
      ev.__clockIn = { positions: {}, messageIds: [], lastSentTs: null };
      need = true;
    } else {
      if (!ck.positions || typeof ck.positions !== 'object') { ck.positions = {}; need = true; }
      if (!Array.isArray(ck.messageIds)) { ck.messageIds = []; need = true; }
      if (!('lastSentTs' in ck)) { ck.lastSentTs = null; need = true; }
    }
    // Normalize position arrays
    const KEYS = ['instance_manager','manager','bouncer','bartender','backup','maybe'];
    for (const k of KEYS) {
      if (!Array.isArray(ev.__clockIn.positions[k])) { ev.__clockIn.positions[k] = []; need = true; }
    }
    if (need) {
      updateEvent(ev.id, { __clockIn: ev.__clockIn });
      changed++;
    }
  }
  console.log(`Clock-in migration complete. Updated ${changed} event(s).`);
}

run();
