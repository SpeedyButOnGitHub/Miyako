// Stop script: reads PID file and attempts to terminate the background bot.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const pidFile = path.join(root, '.bot.pid');

function findIndexJsProcesses() {
  const procs = [];
  try {
    if (process.platform === 'win32') {
      // Use PowerShell to get command lines for processes containing index.js
      const { spawnSync } = require('child_process');
      const out = spawnSync('powershell', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like '*index.js*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json"], { encoding: 'utf8' });
      if (out.status === 0 && out.stdout) {
        let data = out.stdout.trim();
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            parsed.forEach(p => procs.push({ pid: Number(p.ProcessId), cmd: p.CommandLine }));
          } else if (parsed && parsed.ProcessId) {
            procs.push({ pid: Number(parsed.ProcessId), cmd: parsed.CommandLine });
          }
        } catch (e) {
          // ignore parse errors
        }
      }
    } else {
      // unix-like: use ps to find node processes running index.js
      const { spawnSync } = require('child_process');
      const out = spawnSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' });
      if (out.status === 0 && out.stdout) {
        const lines = out.stdout.split(/\r?\n/);
        for (const line of lines) {
          const m = line.match(/^\s*(\d+)\s+(.*)$/);
          if (m) {
            const pid = Number(m[1]);
            const cmd = m[2];
            if (/index\.js/.test(cmd) || /node .*index\.js/.test(cmd)) procs.push({ pid, cmd });
          }
        }
      }
    }
  } catch (e) {
    // best-effort only
  }
  return procs;
}

if (!fs.existsSync(pidFile)) {
  console.warn('No .bot.pid file found. Attempting to locate running bot processes (index.js)...');
  const candidates = findIndexJsProcesses();
  if (candidates.length === 0) {
    console.error('No running bot processes found. Use "npm run start:bg" to start in background.');
    process.exit(1);
  }
  console.log('Found candidate bot processes:', candidates.map(p => p.pid));
  // Attempt graceful shutdown for each candidate
  function processExists(p) { try { process.kill(p, 0); return true; } catch { return false; } }
  for (const p of candidates) {
    try { process.kill(p.pid, 'SIGTERM'); } catch (e) { /* ignore */ }
  }
  // wait briefly and escalate if needed
  setTimeout(() => {
    for (const p of candidates) {
      if (processExists(p.pid)) {
        if (process.platform === 'win32') {
          try { require('child_process').spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F']); } catch (e) { /* ignore */ }
        } else {
          try { process.kill(p.pid, 'SIGKILL'); } catch (e) { /* ignore */ }
        }
      }
    }
    // final cleanup: nothing to remove (no .bot.pid), exit success if processes are gone
    const anyRunning = candidates.some(p => processExists(p.pid));
    if (!anyRunning) {
      console.log('Stopped detected bot processes:', candidates.map(p => p.pid));
      process.exit(0);
    }
    console.error('Failed to terminate detected bot processes:', candidates.map(p => p.pid));
    process.exit(1);
  }, 800);
}

// If we reach here the PID file exists. Read it guardedly.
if (!fs.existsSync(pidFile)) {
  // Shouldn't happen, but guard defensively.
  console.error('Unexpected missing .bot.pid after detection phase. Aborting.');
  process.exit(1);
}
let pidRaw = null;
try {
  pidRaw = fs.readFileSync(pidFile, 'utf8').trim();
} catch (e) {
  console.error('Failed to read .bot.pid:', e?.message || e);
  process.exit(1);
}
const pid = parseInt(pidRaw, 10);
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
