const path = require('path');
const { enqueueWrite } = require('./writeQueue');

function debugLog(filename, obj) {
  try {
    const base = path.join('logs', 'debug');
    const dest = path.join(base, filename);
    const payload = Object.assign({ ts: Date.now() }, obj || {});
    // enqueueWrite expects path and a function that returns string content
    enqueueWrite(dest, () => JSON.stringify(payload, null, 2), { delay: 0 });
  } catch (e) {
    try { console.error('debugLog failed', e); } catch {}
  }
}

module.exports = { debugLog };
