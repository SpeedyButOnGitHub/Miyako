// Centralized error handling helpers with persistence for next-run diagnostics.
const fs = require('fs');
const path = require('path');
const { cfgPath } = require('./paths');

const ERROR_LOG_FILE = cfgPath('errorLog.json');
const MAX_ERRORS = 100; // retention cap
let inMemoryErrors = [];
const errorListeners = [];
let originalConsoleError = null; // set by index.js wrapper

function loadExisting() {
	try {
		if (!fs.existsSync(ERROR_LOG_FILE)) return;
		const raw = fs.readFileSync(ERROR_LOG_FILE, 'utf8');
		const parsed = JSON.parse(raw || '[]');
		if (!Array.isArray(parsed)) return;
		// Drop any historical spam from console scope, retain only last MAX_ERRORS of other scopes
		inMemoryErrors = parsed.filter(e => e && e.scope !== 'console').slice(-MAX_ERRORS);
	} catch { /* ignore */ }
}

loadExisting();

function persist() {
	try {
		fs.writeFileSync(ERROR_LOG_FILE, JSON.stringify(inMemoryErrors.slice(-MAX_ERRORS), null, 2));
	} catch { /* ignore */ }
}

function formatError(err) {
	if (err && err.stack) return err.stack;
	if (typeof err === 'object') {
		try { return JSON.stringify(err); } catch { return String(err); }
	}
	return String(err);
}

function appendEntry(scope, msg) {
	// Skip console scope to prevent runaway growth from console overrides
	if (scope === 'console') return null;
	const entry = { ts: Date.now(), scope, message: msg };
	inMemoryErrors.push(entry);
	if (inMemoryErrors.length > MAX_ERRORS) {
		inMemoryErrors = inMemoryErrors.slice(-MAX_ERRORS);
	}
	persist();
	return entry;
}

function logError(scope, err) {
	const msg = formatError(err);
	// Use original console.error if available to avoid recursion
	if (originalConsoleError) {
		originalConsoleError(`[${scope}]`, msg);
	} else {
		try { process.stderr.write(`[${scope}] ${msg}\n`); } catch {}
	}
	const entry = appendEntry(scope, msg);
	if (entry) {
		for (const fn of errorListeners) {
			try { fn(entry); } catch { /* listener errors ignored */ }
		}
	}
}

// Called by console.error wrapper to record without re-emitting to console (already printed)
function recordExternalError(scope, errLike) {
	const msg = formatError(errLike);
	appendEntry(scope, msg);
}

function setOriginalConsoleError(fn) { originalConsoleError = fn; }

function registerErrorListener(fn) { if (typeof fn === 'function') errorListeners.push(fn); }

function getRecentErrors(limit = 50) {
	return inMemoryErrors.slice(-limit);
}

function clearErrorLog() {
	inMemoryErrors = [];
	persist();
}

function safeReply(target, content, opts = {}) {
	if (!target) return;
	try {
		if (typeof target.reply === 'function') {
			return target.reply({ content, ...opts }).catch(()=>{});
		}
	} catch {}
}

module.exports = { logError, recordExternalError, setOriginalConsoleError, safeReply, getRecentErrors, clearErrorLog, registerErrorListener };
