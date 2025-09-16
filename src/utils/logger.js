const fs = require('fs');
const { logPath } = require('./paths');
const { config } = require('./storage');

const MAX_LOG_SIZE = 512 * 1024; // 512KB per log file
const LEVEL_ORDER = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_FILE = logPath('bot.log');

function ensureLogFile() {
	try {
		if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
	} catch {}
}

function rotateIfNeeded() {
	try {
		const st = fs.statSync(LOG_FILE);
		if (st.size > MAX_LOG_SIZE) {
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			const archive = logPath(`bot-${ts}.log`);
			fs.renameSync(LOG_FILE, archive);
			fs.writeFileSync(LOG_FILE, '');
		}
	} catch {}
}

let _overrideDebugUntil = null; // timestamp in ms until which debug logs are enabled

function shouldLog(level) {
	try {
		// If override window active, allow debug logs until that timestamp
		const now = Date.now();
		const envUntil = process.env.LOG_DEBUG_UNTIL ? Number(process.env.LOG_DEBUG_UNTIL) : null;
		const until = Number.isFinite(envUntil) && envUntil > 0 ? envUntil : _overrideDebugUntil;
		if (until && now <= until) {
			// during override window allow all levels
			return true;
		}
		const min = config.logLevel || 'info';
		return (LEVEL_ORDER[level] || 999) >= (LEVEL_ORDER[min] || 20);
	} catch {
		return true;
	}
}

function baseWrite(level, msg, meta) {
	if (!shouldLog(level)) return;
	ensureLogFile();
	rotateIfNeeded();
	const line = JSON.stringify({ ts: Date.now(), level, msg, ...(meta || {}) });
	try {
		fs.appendFileSync(LOG_FILE, line + '\n');
	} catch {}
	// Mirror to console for non-debug or if debug enabled
	if (level !== 'debug' || config.debugMode) {
		const out = `[${level.toUpperCase()}] ${msg}`;
		try {
			// In test environments (Jest) writing to console after suites complete
			// can cause Jest to treat this as an error. Skip mirroring when running tests.
			const isTest = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
			if (!isTest) {
				if (level === 'error') console.error(out);
				else console.log(out);
			}
		} catch {}
	}
}

module.exports = {
	info: (m, meta) => baseWrite('info', m, meta),
	warn: (m, meta) => baseWrite('warn', m, meta),
	error: (m, meta) => baseWrite('error', m, meta),
	debug: (m, meta) => {
		if (config.debugMode || shouldLog('debug')) baseWrite('debug', m, meta);
	},
	file: LOG_FILE,
	// programmatic control: enable debug logs for a short window (ms duration)
	enableDebugWindow(durationMs) {
		try {
			if (!durationMs || durationMs <= 0) return;
			_overrideDebugUntil = Date.now() + Number(durationMs);
		} catch {}
	},
	// disable any programmatic override
	disableDebugWindow() {
		_overrideDebugUntil = null;
	},
};
