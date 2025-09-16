// One-time migration helper to copy mutable JSON from config/ to data/
// Safe (does not overwrite existing data copies). Can be invoked at startup later.
const fs = require('fs');
const path = require('path');
const { dataPath, cfgPath } = require('../src/utils/paths');

const RUNTIME = [
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

function migrate() {
	let moved = 0;
	for (const file of RUNTIME) {
		const legacy = cfgPath(file);
		const target = dataPath(file);
		try {
			if (fs.existsSync(legacy) && !fs.existsSync(target)) {
				const dir = path.dirname(target);
				if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
				fs.copyFileSync(legacy, target);
				moved++;
			}
		} catch (e) {
			/* ignore individual errors */
		}
	}
	console.log(`[migrate-runtime-data] Completed. Copied ${moved} file(s).`);
}

if (require.main === module) migrate();
module.exports = { migrate };
