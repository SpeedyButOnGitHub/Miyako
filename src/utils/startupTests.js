const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const { runHealthChecks } = require('./health');
const { createSnapshot, compareSnapshots } = require('./changelog');

const projectRoot = path.resolve(process.cwd());
const SUMMARY_FILE = path.join(projectRoot, 'config', 'startup-summary.json');

async function runStartupTests(client) {
	const results = {
		ts: Date.now(),
		checks: [],
		ok: true,
	};

	function add(name, ok, info) {
		results.checks.push({ name, ok: !!ok, info: info || null });
		if (!ok) results.ok = false;
	}

	try {
		// Basic: client ready
		add('client_ready', !!(client && client.isReady && client.isReady()), 'client.isReady()');
	} catch (e) {
		add('client_ready', false, String(e));
	}

	try {
		// Config file write test (ensure config dir writable)
		const tmp = path.join(projectRoot, 'config', `.startup_test_${Date.now()}.tmp`);
		fs.writeFileSync(tmp, 'ok');
		fs.unlinkSync(tmp);
		add('config_writable', true);
	} catch (e) {
		add('config_writable', false, String(e));
	}

	try {
		// ActiveMenus file exists or is creatable
		const am = path.join(projectRoot, 'config', 'activeMenus.json');
		if (fs.existsSync(am)) add('activeMenus_exists', true);
		else {
			fs.writeFileSync(am, '[]');
			add('activeMenus_created', true);
		}
	} catch (e) {
		add('activeMenus', false, String(e));
	}

	try {
		// Changelog snapshot read (and compute simple diff summary)
		const snap = path.join(projectRoot, 'config', 'changelogSnapshot.json');
		let prev = null;
		try {
			if (fs.existsSync(snap)) prev = JSON.parse(fs.readFileSync(snap, 'utf8'));
		} catch {}
		try {
			const curr = createSnapshot(projectRoot);
			const diff = compareSnapshots(prev, curr);
			add('changelog_snapshot', true, {
				added: diff.added.length,
				removed: diff.removed.length,
				modified: diff.modified.length,
			});
		} catch (e) {
			add('changelog_snapshot', false, String(e));
		}
	} catch (e) {
		add('changelogSnapshot', false, String(e));
	}

	try {
		// Health checks (populate a small digest)
		if (client) {
			const health = await runHealthChecks(client).catch((e) => {
				throw e;
			});
			const ok = Array.isArray(health) && health.every((h) => h.ok);
			// produce a small summary: counts and a few non-ok entries
			const nonOk = Array.isArray(health) ? health.filter((h) => !h.ok).slice(0, 5) : [];
			add('health_checks', ok, { total: Array.isArray(health) ? health.length : 0, nonOk });
			results.health = health;
		}
	} catch (e) {
		add('health_checks', false, String(e));
	}

	try {
		// record Node version
		add('node_version', process.version);
	} catch (e) {
		/* ignore */
	}

	try {
		fs.writeFileSync(SUMMARY_FILE, JSON.stringify(results, null, 2));
	} catch (e) {
		logger.warn('[startupTests] could not write summary', { err: e && e.message });
	}

	return results;
}

module.exports = { runStartupTests };
