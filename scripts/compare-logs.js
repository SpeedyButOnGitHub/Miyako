#!/usr/bin/env node
// Summarize command log diffs.
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(process.cwd(),'logs','command_logs.json');
if (!fs.existsSync(LOG_FILE)) { console.error('No command_logs.json'); process.exit(1); }
const lines = fs.readFileSync(LOG_FILE,'utf8').trim().split(/\n+/);
let total=0, diffs=0; const byCmd={};
for (const ln of lines) {
  try {
    const o = JSON.parse(ln);
    total++;
    if (o.diff && o.diff.length) { diffs++; byCmd[o.name] = (byCmd[o.name]||0)+1; }
  } catch {}
}
console.log('Total entries:', total);
console.log('Diff entries :', diffs);
console.log('Diffs by command:', Object.entries(byCmd).sort((a,b)=>b[1]-a[1]));
