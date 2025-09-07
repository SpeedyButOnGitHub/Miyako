const { addSchedule, updateSchedule, getSchedules } = require("./scheduleStorage");
const ms = require("ms");

/**
 * Schedule object shape (stored in schedules.json):
 * {
 *   id: "1",
 *   name: "Reminder",
 *   channelId: "123...",
 *   message: "Hello world",
 *   type: "once" | "daily" | "weekly" | "monthly" | "interval",
 *   time: "HH:MM" (24h),
 *   date: "YYYY-MM-DD" (for once),
 *   days: [0..6] (for weekly, 0=Sunday),
 *   intervalDays: number (for interval),
 *   repeats: null | number (remaining repeats, null = infinite),
 *   enabled: true,
 *   nextRun: 1690000000000 (timestamp ms)
 * }
 */

function parseTimeToMsToday(timeStr) {
  // timeStr: "HH:MM"
  const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 0, mm || 0, 0, 0);
  return t.getTime();
}

function computeNextRun(schedule) {
  const now = Date.now();
  const type = schedule.type || "once";

  const timeMsOfDay = (() => {
    if (!schedule.time) return 0;
    const [hh = 0, mm = 0] = schedule.time.split(":").map(Number);
    return hh * 3600000 + (mm || 0) * 60000;
  })();

  if (type === "once") {
    if (schedule.date && schedule.time) {
      const [y, m, d] = schedule.date.split("-").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      const next = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), ...((schedule.time || "00:00").split(":").map(Number)));
      return next.getTime();
    }
    // fallback: schedule.nextRun if present
    return schedule.nextRun || null;
  }

  if (type === "daily") {
    // today at time
    let candidate = new Date();
    candidate.setHours(...((schedule.time || "00:00").split(":").map(Number)), 0, 0);
    if (candidate.getTime() <= now) candidate = new Date(candidate.getTime() + 24 * 3600000);
    return candidate.getTime();
  }

  if (type === "interval") {
    // intervalDays and nextRun
    if (schedule.nextRun && schedule.nextRun > now) return schedule.nextRun;
    // schedule.intervalDays given
    const days = Math.max(1, Number(schedule.intervalDays) || 1);
    const base = schedule.nextRun && schedule.nextRun > 0 ? schedule.nextRun : now;
    return new Date(base + days * 24 * 3600000).getTime();
  }

  if (type === "weekly") {
    // schedule.days array of weekday numbers [0..6]
    const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [1]; // default Monday
    // find next occurrence (including today if time in future)
    const nowDate = new Date();
    const todayWeekday = nowDate.getDay(); // 0..6
    const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);

    // generate candidate for each upcoming day within next 7 days
    for (let offset = 0; offset < 14; offset++) {
      const d = new Date(nowDate.getTime() + offset * 24 * 3600000);
      const wd = d.getDay();
      if (days.includes(wd)) {
        const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
        if (candidate.getTime() > now) return candidate.getTime();
      }
    }
    // fallback
    return now + 24 * 3600000;
  }

  if (type === "monthly") {
    // schedule.dayOfMonth
    const day = Math.max(1, Number(schedule.dayOfMonth) || 1);
    const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
    let candidate = new Date();
    candidate.setDate(day);
    candidate.setHours(hh, mm, 0, 0);
    if (candidate.getTime() <= now) {
      // move to next month
      const next = new Date(candidate.getFullYear(), candidate.getMonth() + 1, day, hh, mm, 0, 0);
      return next.getTime();
    }
    return candidate.getTime();
  }

  return null;
}

async function runScheduleOnce(client, schedule) {
  try {
    const channel = await client.channels.fetch(schedule.channelId).catch(() => null);
    if (!channel || !channel.send) throw new Error("Invalid channel");
    await channel.send({ content: schedule.message || "Scheduled message" });
    console.log(`Scheduled message sent for schedule ${schedule.id}`);
  } catch (err) {
    console.error("Failed to send scheduled message:", err);
  }
}

function computeAfterRun(schedule) {
  // manage repeats and compute nextRun or mark disabled/finished
  if (schedule.repeats !== null && typeof schedule.repeats !== "undefined") {
    schedule.repeats = Number(schedule.repeats) - 1;
    if (schedule.repeats <= 0) {
      schedule.enabled = false;
      schedule.nextRun = null;
      return schedule;
    }
  }
  // nextRun based on schedule type
  schedule.nextRun = computeNextRun(schedule);
  return schedule;
}

function startScheduler(client, opts = {}) {
  // run every 15 seconds to be responsive (cheap)
  const tickInterval = opts.intervalMs || 15 * 1000;

  // ensure existing schedules have nextRun computed
  const schedules = getSchedules();
  for (const s of schedules) {
    if (!s.nextRun || s.nextRun < Date.now()) {
      const nr = computeNextRun(s);
      if (nr) updateSchedule(s.id, { nextRun: nr });
    }
  }

  setInterval(async () => {
    const list = getSchedules();
    const now = Date.now();
    for (const schedule of list) {
      try {
        if (!schedule.enabled) continue;
        if (!schedule.nextRun) {
          const nr = computeNextRun(schedule);
          await updateSchedule(schedule.id, { nextRun: nr });
          continue;
        }
        if (schedule.nextRun <= now + 5000) { // allow small drift
          await runScheduleOnce(client, schedule);
          const after = computeAfterRun({ ...schedule });
          await updateSchedule(schedule.id, after);
        }
      } catch (err) {
        console.error("Scheduler loop error for schedule", schedule.id, err);
      }
    }
  }, tickInterval);
}

module.exports = {
  startScheduler,
  computeNextRun,
  computeAfterRun
};