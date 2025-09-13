// Stop script: reads PID file and attempts to terminate the background bot.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pidFile = path.join(root, '.bot.pid');

if (!fs.existsSync(pidFile)) {
  console.error('No .bot.pid file found. Use "npm run start:bg" to start in background.');
  process.exit(1);
}

const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
if (!pid || Number.isNaN(pid)) {
  console.error('Invalid PID in .bot.pid. Remove the file manually.');
  process.exit(1);
}

function processExists(p) {
  try { process.kill(p, 0); return true; } catch { return false; }
}

if (!processExists(pid)) {
  console.warn('Process not running; cleaning up stale PID file.');
  fs.unlinkSync(pidFile);
  process.exit(0);
}

try {
  process.kill(pid, 'SIGTERM');
} catch (e) {
  console.warn('Primary SIGTERM failed:', e.message);
}

// Windows sometimes needs taskkill for detached trees.
setTimeout(() => {
  if (processExists(pid)) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  }
  if (!processExists(pid)) {
    console.log('Bot process stopped:', pid);
    try { fs.unlinkSync(pidFile); } catch {}
    process.exit(0);
  } else {
    console.error('Failed to terminate PID', pid);
    process.exit(1);
  }
}, 700);
