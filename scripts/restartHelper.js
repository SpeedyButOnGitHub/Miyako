// Wait for singleton lock to clear, then start index.js (prevents race on Windows)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const lockFile = path.join(root, '.miyako.lock');

const timeoutMs = 15000; // max wait for lock to clear
const intervalMs = 200; // poll interval

function start() {
	const child = spawn(process.execPath, ['index.js'], {
		cwd: root,
		env: process.env,
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	});
	try {
		child.unref();
	} catch {}
}

const startTs = Date.now();
const timer = setInterval(() => {
	const exists = fs.existsSync(lockFile);
	if (!exists) {
		clearInterval(timer);
		start();
		process.exit(0);
	}
	if (Date.now() - startTs > timeoutMs) {
		// Lock persisted too long; assume stale and try starting anyway
		try {
			fs.unlinkSync(lockFile);
		} catch {}
		clearInterval(timer);
		start();
		process.exit(0);
	}
}, intervalMs);
