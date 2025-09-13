const fs = require('fs');
const path = require('path');
const storage = require('../src/utils/eventsStorage');

const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');
const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

function backup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `events.json.backup.${timestamp}`);
  fs.copyFileSync(EVENTS_FILE, dest);
  console.log('Backup created at', dest);
}

function main() {
  backup();
  const evs = storage.getEvents();
  console.log('Total events before:', evs.length);
  const keepName = 'Midnight Bar';
  const toKeep = evs.filter(e => e.name === keepName).map(e => String(e.id));
  if (toKeep.length === 0) {
    console.error('No events found with name', keepName);
    return process.exit(1);
  }
  console.log('Keeping IDs:', toKeep.join(', '));
  for (const e of evs) {
    if (!toKeep.includes(String(e.id))) {
      const removed = storage.removeEvent(e.id);
      if (!removed) console.warn('Failed to remove', e.id, e.name);
    }
  }
  const after = storage.getEvents();
  console.log('Total events after:', after.length);
  console.log('Remaining events:', after.map(e => `${e.id}:${e.name}`).join('\n'));
}

main();
