const ms = require("ms");

function parseTime(str) {
  if (!str) return null;
  try { return ms(str); } catch { return null; }
}

module.exports = { parseTime, ms };
