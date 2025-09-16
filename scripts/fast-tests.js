/* A tiny test runner that reads a curated list from fast-tests.json and invokes jest with those paths.
   This lets us maintain the list easily and keep package.json simple.
*/
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const listPath = path.join(root, 'fast-tests.json');
let tests;
try {
	tests = JSON.parse(fs.readFileSync(listPath, 'utf8'));
} catch (err) {
	console.error('Failed to read fast-tests.json:', err.message);
	process.exit(2);
}

if (!Array.isArray(tests) || tests.length === 0) {
	console.error('fast-tests.json must be a non-empty array of test paths');
	process.exit(2);
}

const localJest = path.join(
	root,
	'node_modules',
	'.bin',
	'jest' + (process.platform === 'win32' ? '.cmd' : ''),
);

const args = ['--runTestsByPath', ...tests, '--maxWorkers=50%'];

// Try the local jest binary first; if it's missing or fails, fall back to `npx jest`.
// Prefer running the JS CLI via node for maximum cross-platform compatibility.
const jestJs = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');
let res;
if (fs.existsSync(jestJs)) {
	console.log('Using node + jest cli:', jestJs);
	try {
		res = spawnSync(process.execPath, [jestJs, ...args], { stdio: 'inherit', cwd: root });
	} catch (err) {
		console.error('Failed to spawn node jest cli:', err && err.message);
	}
}

if (!res || res.error || (typeof res.status === 'number' && res.status !== 0)) {
	console.log('Falling back to `npx jest` (this may be slightly slower).');
	try {
		// Use the shell so that npx resolution works reliably on Windows + non-Windows
		res = spawnSync('npx jest ' + args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' '), {
			stdio: 'inherit',
			cwd: root,
			shell: true,
		});
	} catch (err) {
		console.error('Failed to spawn npx jest:', err && err.message);
		process.exit(2);
	}
}

if (res && res.error) {
	console.error('Test runner failed:', res.error && res.error.message);
}
const code = res && typeof res.status === 'number' ? res.status : 0;
process.exit(code);
