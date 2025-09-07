const fs = require("fs");
const path = require("path");

const SCHEDULES_FILE = path.resolve("./config/schedules.json");

function _ensureFile() {
  if (!fs.existsSync(SCHEDULES_FILE)) {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ nextId: 1, schedules: [] }, null, 2));
  }
}

function loadData() {
  _ensureFile();
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_FILE, "utf8"));
  } catch (err) {
    console.error("Failed to parse schedules.json, resetting:", err);
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify({ nextId: 1, schedules: [] }, null, 2));
    return { nextId: 1, schedules: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(data, null, 2));
}

function getSchedules() {
  const data = loadData();
  return data.schedules;
}

function addSchedule(schedule) {
  const data = loadData();
  schedule.id = String(data.nextId++);
  data.schedules.push(schedule);
  saveData(data);
  return schedule;
}

function updateSchedule(id, patch) {
  const data = loadData();
  const idx = data.schedules.findIndex(s => s.id === String(id));
  if (idx === -1) return null;
  data.schedules[idx] = { ...data.schedules[idx], ...patch };
  saveData(data);
  return data.schedules[idx];
}

function removeSchedule(id) {
  const data = loadData();
  const idx = data.schedules.findIndex(s => s.id === String(id));
  if (idx === -1) return false;
  data.schedules.splice(idx, 1);
  saveData(data);
  return true;
}

function getSchedule(id) {
  const data = loadData();
  return data.schedules.find(s => s.id === String(id)) || null;
}

module.exports = {
  getSchedules,
  addSchedule,
  updateSchedule,
  removeSchedule,
  getSchedule
};