// Concatenate repository source files into a single text file for copy-paste context
// Output: FULL_CONTEXT.txt at repo root
// Includes: .js, .json, .md
// Excludes: node_modules, .git, .vscode, .env, pid/lock/log artifacts

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'FULL_CONTEXT.txt');

const excludeDirs = new Set(['node_modules', '.git', '.vscode', 'logs']);
const excludeFiles = new Set([
  '.env', '.bot.pid', '.miyako.lock', 'logs_runner.txt', 'FULL_CONTEXT.txt',
  'PROJECT_SUMMARY.txt', 'schedule_summary.txt',
  // dynamic config/state files
  'activeMenus.json', 'bank.json', 'botStatus.json', 'buttonSessions.json',
  'cash.json', 'changelogSnapshot.json', 'crash-latest.json', 'depositProgress.json',
  'errorLog.json', 'levels.json', 'process-heartbeat.json', 'snipes.json',
  'testingBank.json', 'testingCash.json', 'vcLevels.json'
]);
const allowedExt = new Set(['.js', '.json', '.md']);

function langForExt(ext) {
  switch (ext) {
    case '.js':
      return 'javascript';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    default:
      return '';
  }
}

function listFiles(dir) {
  const items = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (excludeDirs.has(name)) continue;
      items.push(...listFiles(full));
    } else {
      if (excludeFiles.has(name)) continue;
      const ext = path.extname(name).toLowerCase();
      if (!allowedExt.has(ext)) continue;
      // Skip binary-ish big files (none expected for these ext) and the output file
      if (rel.replace(/\\/g, '/') === 'FULL_CONTEXT.txt') continue;
      items.push(full);
    }
  }
  return items;
}

function main() {
  const files = listFiles(root).sort();
  const ws = fs.createWriteStream(outFile, { encoding: 'utf8' });
  const header = [
    '===== BEGIN REPO CONTEXT =====',
    `Repo: ${path.basename(root)}  (generated: ${new Date().toISOString()})`,
    'Notes:',
    '- Sensitive runtime files are excluded (e.g., .env, pid/lock).',
    '- Sections are delimited by FILE markers and fenced code blocks.',
    '',
  ].join('\n');
  ws.write(header + '\n');

  for (const full of files) {
    const rel = path.relative(root, full).replace(/\\/g, '/');
    const ext = path.extname(full).toLowerCase();
    const lang = langForExt(ext);
    ws.write(`\n===== FILE: ${rel} =====\n`);
    ws.write('```' + lang + '\n');
    try {
      const content = fs.readFileSync(full, 'utf8');
      ws.write(content.replace(/```/g, '\u0060\u0060\u0060'));
    } catch (e) {
      ws.write(`/* Failed to read file: ${e.message} */\n`);
    }
    ws.write('\n```\n');
  }

  ws.write('\n===== END REPO CONTEXT =====\n');
  ws.end();
  ws.on('close', () => {
    console.log(`[export-text] Wrote ${files.length} files into ${outFile}`);
  });
}

if (require.main === module) main();
