// scheduleService: abstraction over scheduler & related storage to decouple commands from raw utils
// Phase 1: thin wrappers; future phases can add caching, validation, conflict detection.

const scheduler = require('../utils/scheduler');
const scheduleStorage = require('../utils/scheduleStorage');
const eventsStorage = require('../utils/eventsStorage');

function start(client, opts) {
  return scheduler.startScheduler(client, opts);
}

function computeNextRun(schedule) {
  return scheduler.computeNextRun(schedule);
}

function computeAfterRun(schedule) {
  return scheduler.computeAfterRun(schedule);
}

// Re-export storage helpers for now (could be narrowed later)
module.exports = {
  start,
  computeNextRun,
  computeAfterRun,
  addSchedule: scheduleStorage.addSchedule,
  updateSchedule: scheduleStorage.updateSchedule,
  getSchedules: scheduleStorage.getSchedules,
  // Events
  getEvents: eventsStorage.getEvents,
  getEvent: eventsStorage.getEvent,
  addEvent: eventsStorage.addEvent,
  updateEvent: eventsStorage.updateEvent,
  removeEvent: eventsStorage.removeEvent
};
