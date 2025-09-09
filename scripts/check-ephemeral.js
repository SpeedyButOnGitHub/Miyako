#!/usr/bin/env node
// Fails if any source file still contains deprecated ephemeral:true usage.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function listTracked() {
  const out = execSync('git ls-files "*.js"', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  return out;
}

function scan() {
  const bad = [];
  for (const file of listTracked()) {
    const content = fs.readFileSync(path.resolve(file), 'utf8');
    if (content.includes('ephemeral:true') || content.includes('ephemeral: true')) bad.push(file);
  }
  return bad;
}

const bad = scan();
if (bad.length) {
  console.error('\nDeprecated ephemeral:true found in:');
  for (const f of bad) console.error(' -', f);
  console.error('\nUse { flags: 1<<6 } (EPHEMERAL) instead.');
  process.exit(1);
}
console.log('Ephemeral usage check passed.');