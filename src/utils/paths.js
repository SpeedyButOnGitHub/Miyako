const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
	let dir = startDir;
	const root = path.parse(dir).root;
	while (dir && dir !== root) {
		try {
			if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
		} catch {}
		dir = path.dirname(dir);
	}
	// Fallback to CWD when package.json not found
	return process.cwd();
}

const projectRoot = findProjectRoot(__dirname);

// Allow tests or CI to override the runtime data directory via environment variable
// e.g. MIYAKO_RUNTIME_DIR=C:\some\tmp\dir
function cfgPath(...parts) { return path.join(projectRoot, 'config', ...parts); }
function dataDir() {
	if (process.env.MIYAKO_RUNTIME_DIR && String(process.env.MIYAKO_RUNTIME_DIR).trim()) {
		try { const p = String(process.env.MIYAKO_RUNTIME_DIR); if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); return p; } catch {};
	}
	return path.join(projectRoot, 'data');
}
function logsDir() { return path.join(projectRoot, 'logs'); }
function ensureDir(p) { try { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); } catch {} }
function logPath(...parts) { const dir = logsDir(); ensureDir(dir); return path.join(dir, ...parts); }
function dataPath(...parts) { const dir = dataDir(); ensureDir(dir); return path.join(dir, ...parts); }

// Runtime (mutable) JSON files historically lived in /config; we remap them to /data with fallback.
const RUNTIME_JSON = new Set([
	'bank.json','cash.json','events.json','schedules.json','levels.json','depositProgress.json','buttonSessions.json','activeMenus.json','testingBank.json','testingCash.json','changelogSnapshot.json','snipes.json','errorLog.json','crash-latest.json','lastShutdown.json','settingMeta.json'
]); // vcLevels.json & process-heartbeat.json treated as volatile (ignored) and handled separately

function runtimeFile(name) {
	if (!RUNTIME_JSON.has(name)) return cfgPath(name); // treat as config or template
	const newPath = dataPath(name);
	// Backward compatibility: if new file missing but old exists, read from old location; writes go to new
	try {
		if (!fs.existsSync(newPath)) {
			const oldPath = cfgPath(name);
			if (fs.existsSync(oldPath)) return oldPath; // let first read come from legacy path until migrated
		}
	} catch {}
	return newPath;
}

module.exports = { projectRoot, cfgPath, dataPath, logPath, runtimeFile, logsDir, dataDir };
