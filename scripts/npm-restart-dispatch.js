// Dispatcher so `npm restart miyako` works cross-platform and with npm's restart semantics.
// Usage: npm restart <target>
// If target is "miyako" it will run the restart:miyako script (stop then start).

const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const target =
	argv[0] ||
	(process.env.npm_config_argv &&
		(() => {
			try {
				return JSON.parse(process.env.npm_config_argv).original[1];
			} catch {
				return null;
			}
		})()) ||
	null;

if (target === 'miyako') {
	console.log('Dispatching restart:miyako (stop then start)');
	const r = spawnSync(
		process.platform === 'win32' ? 'cmd' : 'sh',
		[process.platform === 'win32' ? '/c' : '-c', 'npm run restart:miyako:exec'],
		{ stdio: 'inherit' },
	);
	process.exit(r.status || 0);
}

console.log('No restart target matched. Running default npm run start');
const r = spawnSync(
	process.platform === 'win32' ? 'cmd' : 'sh',
	[process.platform === 'win32' ? '/c' : '-c', 'npm run start'],
	{ stdio: 'inherit' },
);
process.exit(r.status || 0);
