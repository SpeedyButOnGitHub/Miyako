const os = require('os');
const path = require('path');
const fs = require('fs');

// Create a temporary runtime dir for tests to avoid mutating repo data/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'miyako-test-data-'));
process.env.MIYAKO_RUNTIME_DIR = tmp;

// Expose the runtime dir for tests to inspect if needed
global.__MIYAKO_TEST_RUNTIME_DIR = tmp;

console.log('[jest.setup] MIYAKO_RUNTIME_DIR ->', tmp);

// Cleanup helper: remove the temp runtime dir on exit if it looks like a test-created dir
function safeCleanup(dir) {
	try {
		if (!dir) return;
		// only remove directories that look like the ones we created
		if (!dir.startsWith(os.tmpdir())) return;
		const base = path.basename(dir);
		if (!base.startsWith('miyako-test-data-')) return;
		if (fs.existsSync(dir)) {
			fs.rmSync(dir, { recursive: true, force: true });
			// console.log('[jest.setup] cleaned up', dir);
		}
	} catch (e) {
		// ignore cleanup errors
	}
}

function cleanupAndExit(code) {
	safeCleanup(global.__MIYAKO_TEST_RUNTIME_DIR);
	if (typeof code === 'number') process.exit(code);
}

process.on('exit', () => safeCleanup(global.__MIYAKO_TEST_RUNTIME_DIR));
process.on('SIGINT', () => cleanupAndExit(130));
process.on('SIGTERM', () => cleanupAndExit(143));
process.on('uncaughtException', (err) => {
	safeCleanup(global.__MIYAKO_TEST_RUNTIME_DIR);
	throw err;
});
