// Watch the repo and auto-regenerate paste-friendly summaries for ChatGPT
// - Regenerates: PROJECT_SUMMARY.txt and FULL_CONTEXT.txt
// - Debounced to avoid thrashing; ignores its own output files

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const OUT_SUMMARY = path.join(root, 'PROJECT_SUMMARY.txt');
const OUT_FULL = path.join(root, 'FULL_CONTEXT.txt');

const excludeDirs = new Set(['node_modules', '.git', '.vscode']);
const excludeFiles = new Set([
  '.env', '.bot.pid', '.miyako.lock', 'logs_runner.txt',
  'PROJECT_SUMMARY.txt', 'FULL_CONTEXT.txt', 'schedule_summary.txt'
]);
const allowedExt = new Set(['.js', '.json', '.md']);

function isExcluded(file) {
  const base = path.basename(file);
  if (excludeFiles.has(base)) return true;
  // inside excluded dirs?
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.some(p => excludeDirs.has(p))) return true;
  const ext = path.extname(file).toLowerCase();
  return !allowedExt.has(ext);
}

let pending = false;
let timer = null;
let running = false;

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(root, ...args)], { cwd: root, stdio: 'ignore' });
    p.on('exit', () => resolve());
  });
}

async function regenerate() {
  if (running) return; // coalesce
  running = true;
  try {
    await run('node', ['scripts', 'export-summary.js']);
    await run('node', ['scripts', 'export-text.js']);
    // Optional: if a schedule summary exporter exists, run it here
    const schedExporter = path.join(root, 'scripts', 'export-schedule-summary.js');
    try { if (fs.existsSync(schedExporter)) await run('node', ['scripts', 'export-schedule-summary.js']); } catch {}
    console.log(`[export-watch] Updated summaries at ${new Date().toISOString()}`);
  } catch (e) {
    console.error('[export-watch] regenerate error', e);
  } finally {
    running = false;
  }
}

function scheduleRegen(reason) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; regenerate(); }, 600);
}

function startWatch() {
  // Initial build
  regenerate();
  // fs.watch recursive works on Windows/macOS; good for this project context
  try {
    const watcher = fs.watch(root, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const full = path.join(root, filename);
      if (isExcluded(full)) return;
      scheduleRegen(`${event}:${filename}`);
    });
    watcher.on('error', () => {});
    console.log('[export-watch] Watching for changes...');
  } catch (e) {
    console.error('[export-watch] fs.watch failed; falling back to interval scan');
    let lastTick = 0;
    setInterval(() => {
      const now = Date.now();
      if (now - lastTick < 2000) return;
      lastTick = now;
      scheduleRegen('interval');
    }, 2500).unref?.();
  }
}

if (require.main === module) startWatch();
