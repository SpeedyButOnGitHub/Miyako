const fs = require('fs');
const path = require('path');

const LOCK_FILE = path.join(__dirname, '..', '..', '.miyako.lock');

function pidAlive(pid) {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function ensureSingleton() {
	try {
		if (fs.existsSync(LOCK_FILE)) {
			try {
				const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
				if (data && pidAlive(data.pid)) {
					try {
						require('./logger').error('[singleton] duplicate instance detected', {
							existingPid: data.pid,
						});
					} catch {}
					process.exit(1);
				} else {
					// stale lock
					fs.unlinkSync(LOCK_FILE);
				}
			} catch {
				/* ignore parse errors; treat as stale */ try {
					fs.unlinkSync(LOCK_FILE);
				} catch {}
			}
		}
		fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, started: Date.now() }));
		const cleanup = () => {
			try {
				if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
			} catch {}
		};
		process.once('exit', cleanup);
		process.once('SIGINT', () => {
			cleanup();
			process.exit(0);
		});
		process.once('SIGTERM', () => {
			cleanup();
			process.exit(0);
		});
	} catch (e) {
		console.warn('[singleton] lock error (continuing anyway):', e.message);
	}
}

module.exports = { ensureSingleton };
