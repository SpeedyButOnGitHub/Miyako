// Run stop then start, but tolerate stop failures so restart proceeds to start.
const { spawnSync } = require('child_process');
function run(cmd) {
	const r = spawnSync(
		process.platform === 'win32' ? 'cmd' : 'sh',
		[process.platform === 'win32' ? '/c' : '-c', cmd],
		{ stdio: 'inherit' },
	);
	return r.status || 0;
}
console.log('Running stop (tolerant)...');
const stopCode = run('npm run stop');
if (stopCode !== 0) console.warn('Stop exited with code', stopCode, '- continuing to start.');
console.log('Running start...');
const startCode = run('npm run start');
process.exit(startCode);
