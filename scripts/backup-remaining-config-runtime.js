const fs = require('fs');
const path = require('path');
const { dataPath, cfgPath } = require('../src/utils/paths');

const CANDIDATES = ['botStatus.json', 'startup-summary.json'];

function run() {
	const bakDir = dataPath('backups');
	try {
		if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });
	} catch {}
	const stamp = new Date().toISOString().replace(/[:]/g, '-');
	const summary = { ts: new Date().toISOString(), files: [] };
	// backup explicit candidates
	for (const f of CANDIDATES) {
		const src = cfgPath(f);
		if (!fs.existsSync(src)) continue;
		try {
			const dest = path.join(bakDir, f + '.config.bak.' + stamp);
			fs.copyFileSync(src, dest);
			summary.files.push({ file: f, backedUpTo: dest });
			try {
				fs.unlinkSync(src);
			} catch {}
		} catch (e) {}
	}
	// backup any events.json.tmp* files
	try {
		const cfgDir = path.dirname(cfgPath('events.json'));
		const files = fs.readdirSync(cfgDir).filter((n) => /^events\.json\.tmp-/.test(n));
		for (const f of files) {
			const src = path.join(cfgDir, f);
			const dest = path.join(bakDir, f + '.config.bak.' + stamp);
			try {
				fs.copyFileSync(src, dest);
				summary.files.push({ file: f, backedUpTo: dest });
				try {
					fs.unlinkSync(src);
				} catch {}
			} catch {}
		}
	} catch (e) {}
	try {
		fs.writeFileSync(
			path.join(bakDir, 'prune-remaining-summary-' + stamp + '.json'),
			JSON.stringify(summary, null, 2),
		);
	} catch {}
	console.log('[backup-remaining-config-runtime] completed.');
}

if (require.main === module) run();
module.exports = { run };
