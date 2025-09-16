const fs = require('fs');
const path = require('path');
const { dataPath, cfgPath } = require('../src/utils/paths');

const FILES = [
	'bank.json',
	'cash.json',
	'events.json',
	'schedules.json',
	'levels.json',
	'vcLevels.json',
	'depositProgress.json',
	'buttonSessions.json',
	'activeMenus.json',
	'testingBank.json',
	'testingCash.json',
	'changelogSnapshot.json',
	'snipes.json',
	'errorLog.json',
	'crash-latest.json',
	'process-heartbeat.json',
	'lastShutdown.json',
	'settingMeta.json',
];

function run() {
	const bakDir = dataPath('backups');
	try {
		if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
	} catch {}
	const stamp = new Date().toISOString().replace(/[:]/g, '-');
	const summary = { ts: new Date().toISOString(), files: [] };
	for (const f of FILES) {
		const src = cfgPath(f);
		if (!fs.existsSync(src)) continue;
		try {
			const dest = path.join(bakDir, f + '.config.bak.' + stamp);
			fs.copyFileSync(src, dest);
			summary.files.push({ file: f, backedUpTo: dest });
			// remove original config copy
			try {
				fs.unlinkSync(src);
			} catch {}
		} catch (e) {
			// continue on error
		}
	}
	try {
		fs.writeFileSync(
			path.join(bakDir, 'prune-summary-' + stamp + '.json'),
			JSON.stringify(summary, null, 2),
		);
	} catch {}
	console.log('[backup-and-prune-config-runtime] completed.');
}

if (require.main === module) run();
module.exports = { run };
