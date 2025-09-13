// Auto-restart runner for Miyako
// - Restarts on crash (non-zero exit) with backoff
// - Monitors heartbeat and restarts if stale (hung)
// - Cleans up child on runner exit
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hbFile = path.join(root, 'config', 'process-heartbeat.json');
const logFile = path.join(root, 'logs_runner.txt');

function log(line) {
  const s = `[${new Date().toISOString()}] ${line}\n`;
  try { fs.appendFileSync(logFile, s); } catch {}
}

function readHeartbeatTs() {
  try { const j = JSON.parse(fs.readFileSync(hbFile, 'utf8')); return j.ts || 0; } catch { return 0; }
}

let child = null;
let stopping = false;
let backoffMs = 2000;
const backoffMax = 30000;
const hbStaleMs = 3 * 60 * 1000; // 3 minutes
let lastStart = 0;

function startChild() {
  lastStart = Date.now();
  child = spawn(process.execPath, ['index.js'], {
    cwd: root,
    detached: false,
    stdio: 'ignore'
  });
  log(`child started pid=${child.pid}`);
  child.on('exit', (code, signal) => {
    const dur = Date.now() - lastStart;
    log(`child exit code=${code} signal=${signal} uptimeMs=${dur}`);
    if (stopping) return; // runner is shutting down deliberately
    // Reset backoff if it ran long enough (10m)
    if (dur > 10 * 60 * 1000) backoffMs = 2000;
    setTimeout(() => {
      backoffMs = Math.min(backoffMax, backoffMs * 2);
      startChild();
    }, backoffMs);
  });
}

function killChildTree(cb) {
  if (!child || child.killed) return cb?.();
  try { child.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    // On Windows, ensure the tree is killed
    if (process.platform === 'win32') {
      const { spawnSync } = require('child_process');
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
    }
    cb?.();
  }, 700);
}

// Heartbeat monitor
setInterval(() => {
  if (!child) return;
  const now = Date.now();
  const hb = readHeartbeatTs();
  if (!hb) return; // not yet initialized
  const stale = now - hb;
  if (stale > hbStaleMs) {
    log(`heartbeat stale (${stale}ms) -> restarting child`);
    killChildTree(() => {
      // child exit handler will schedule restart with backoff
    });
  }
}, 60000).unref?.();

process.on('SIGINT', () => { stopping = true; log('runner SIGINT'); killChildTree(() => process.exit(0)); });
process.on('SIGTERM', () => { stopping = true; log('runner SIGTERM'); killChildTree(() => process.exit(0)); });
process.on('exit', () => { stopping = true; killChildTree(); });

startChild();
