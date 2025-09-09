// Utility to substitute dynamic timestamp placeholders inside event messages.
// Placeholders supported (case sensitive):
//  - timestamp_opening1 : opening time for first range (or first time entry)
//  - closing1 / timestamp_closing1 : closing time for first range (or second time entry / +2h fallback)
//  - timestamp_opening2 / opening2 : static placeholder provided by user (not yet dynamic)
//  - closing2 / timestamp_closing2 : static placeholder provided by user (not yet dynamic)
// Additional forms can be added easily.

function parseHM(str) {
  if (!str) return { h:0, m:0, ok:false };
  const [h,m] = str.split(':').map(x=>parseInt(x,10));
  if (Number.isNaN(h) || Number.isNaN(m)) return { h:0, m:0, ok:false };
  return { h, m, ok:true };
}

function computeNextRange(ev) {
  const now = new Date();
  // Determine days list; if empty treat all days
  const days = Array.isArray(ev.days) && ev.days.length ? ev.days : [0,1,2,3,4,5,6];
  let startDate = null, endDate = null;
  if (Array.isArray(ev.ranges) && ev.ranges.length) {
    const r = ev.ranges[0];
    if (r && r.start && r.end) {
      const { h:sh, m:sm, ok:okS } = parseHM(r.start);
      const { h:eh, m:em, ok:okE } = parseHM(r.end);
      if (okS && okE) {
        for (let offset=0; offset<30; offset++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+offset, 0,0,0,0);
            if (!days.includes(d.getDay())) continue;
            const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0, 0);
            const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0, 0);
            // If end <= start (overnight), push end to next day
            if (e <= s) e.setDate(e.getDate()+1);
            // Accept first future start or ongoing range today
            if (s.getTime() >= now.getTime() - 5*60*1000) { // allow slight past for current range
              startDate = s; endDate = e; break;
            }
        }
      }
    }
  }
  if (!startDate) {
    // Fallback to times
    const times = Array.isArray(ev.times) ? ev.times.filter(Boolean) : [];
    if (times.length) {
      const { h:sh, m:sm, ok:okS } = parseHM(times[0]);
      let eh=sh+2, em=sm; // +2h fallback
      if (times[1]) { const t2 = parseHM(times[1]); if (t2.ok) { eh=t2.h; em=t2.m; } }
      if (okS) {
        for (let offset=0; offset<30; offset++) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()+offset, 0,0,0,0);
          if (!days.includes(d.getDay())) continue;
          const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm, 0, 0);
          const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0, 0);
          if (e <= s) e.setHours(e.getHours()+2);
          if (s.getTime() >= now.getTime() - 5*60*1000) { startDate = s; endDate = e; break; }
        }
      }
    }
  }
  if (!startDate) return null;
  return { startSec: Math.floor(startDate.getTime()/1000), endSec: Math.floor(endDate.getTime()/1000) };
}

function buildTimestampMap(ev) {
  const map = {};
  const r = computeNextRange(ev);
  if (r) {
    map.timestamp_opening1 = `<t:${r.startSec}:t>`;
    map.opening1 = map.timestamp_opening1;
    map.closing1 = `<t:${r.endSec}:t>`;
    map.timestamp_closing1 = map.closing1;
  // Backwards compatible aliases (un-numbered forms)
  map.timestamp_opening = map.timestamp_opening1;
  map.opening = map.opening1;
  map.timestamp_closing = map.timestamp_closing1;
  map.closing = map.closing1;
  }
  // Static placeholders for second opening per user instruction
  map.timestamp_opening2 = '<t:1757412000:t>';
  map.opening2 = map.timestamp_opening2;
  map.closing2 = '<t:1757433600:t>';
  map.timestamp_closing2 = map.closing2;
  return map;
}

function applyTimestampPlaceholders(text, ev) {
  if (!text || typeof text !== 'string') return text;
  const map = buildTimestampMap(ev);
  let out = text;
  for (const [k,v] of Object.entries(map)) {
    if (!v) continue;
    out = out.split(k).join(v);
  }
  return out;
}

module.exports = { applyTimestampPlaceholders, buildTimestampMap, computeNextRange };