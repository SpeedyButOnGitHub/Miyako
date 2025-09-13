#!/usr/bin/env node
// Forces log rotation by writing enough lines to exceed MAX_LOG_SIZE.
const { file: LOG_FILE } = require('../src/utils/logger');
const fs = require('fs');
const path = require('path');
const { logPath } = require('../src/utils/paths');
const targetSize = 520 * 1024; // just over threshold
const line = 'x'.repeat(400) + '\n';
let written = 0;
while (written < targetSize) {
  fs.appendFileSync(LOG_FILE, line);
  written += line.length;
}
console.log('Wrote', written, 'bytes. Check logs directory for rotated file.');
