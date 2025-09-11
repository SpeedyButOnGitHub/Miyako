#!/usr/bin/env node
// Pretty tail for structured JSONL bot logs.
// Usage: node scripts/log-tail.js [--follow] [--level=info] [--since=ISOorMs]
const fs = require('fs');
const path = require('path');
const { file: LOG_FILE } = require('../src/utils/logger');
const args = process.argv.slice(2);
const follow = args.includes('--follow') || args.includes('-f');
let levelArg = 'debug';
let sinceArg = null;
for (const a of args) {
  if (a.startsWith('--level=')) levelArg = a.split('=')[1];
  if (a.startsWith('--since=')) sinceArg = a.split('=')[1];
}
const LEVEL_ORDER = { debug:10, info:20, warn:30, error:40 };
function passLevel(l) { return (LEVEL_ORDER[l]||0) >= (LEVEL_ORDER[levelArg]||0); }
let sinceTs = 0;
if (sinceArg) {
  if (/^\d+$/.test(sinceArg)) sinceTs = Number(sinceArg);
  else {
    const d = new Date(sinceArg); if (!isNaN(d)) sinceTs = d.getTime();
  }
}
function format(line) {
  try {
    const o = JSON.parse(line);
    if (sinceTs && o.ts < sinceTs) return null;
    if (!passLevel(o.level)) return null;
    const ts = new Date(o.ts).toISOString().split('T')[1].replace('Z','');
    let meta = { ...o }; delete meta.ts; delete meta.level; delete meta.msg;
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const color = o.level === 'error' ? '\x1b[31m' : o.level === 'warn' ? '\x1b[33m' : o.level === 'info' ? '\x1b[36m' : '\x1b[90m';
    const reset='\x1b[0m';
    return `${color}${ts} ${o.level.toUpperCase()}${reset} ${o.msg}${metaStr}`;
  } catch { return null; }
}
function dumpExisting() {
  if (!fs.existsSync(LOG_FILE)) return;
  const lines = fs.readFileSync(LOG_FILE,'utf8').trim().split(/\n+/);
  for (const ln of lines) {
    const out = format(ln); if (out) process.stdout.write(out+'\n');
  }
}
function followFile() {
  let size = 0;
  try { size = fs.statSync(LOG_FILE).size; } catch {}
  fs.watch(path.dirname(LOG_FILE), (evt, file) => {
    if (file && file.startsWith(path.basename(LOG_FILE))) {
      try {
        const st = fs.statSync(LOG_FILE);
        if (st.size < size) { size = 0; }
        if (st.size > size) {
          const fd = fs.openSync(LOG_FILE,'r');
          const buf = Buffer.alloc(st.size - size);
            fs.readSync(fd, buf, 0, buf.length, size);
            fs.closeSync(fd);
            size = st.size;
            buf.toString('utf8').split(/\n+/).forEach(l=>{ const out = format(l); if(out) process.stdout.write(out+'\n'); });
        }
      } catch {}
    }
  });
}
 dumpExisting();
 if (follow) followFile();
