// Background start script: spawns the bot detached and writes a PID file.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pidFile = path.join(root, '.bot.pid');

if (fs.existsSync(pidFile)) {
  console.error('Refusing to start: .bot.pid already exists. If the bot is not running, delete .bot.pid.');
  process.exit(1);
}

const child = spawn(process.execPath, ['index.js'], {
  cwd: root,
  detached: true,
  stdio: 'ignore'
});

child.unref();
fs.writeFileSync(pidFile, String(child.pid));
console.log('Bot started in background. PID:', child.pid);
