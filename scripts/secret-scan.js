#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const patterns = [
	// Discord bot token pattern: 24chars.6chars.27chars
	/[A-Za-z0-9_\-]{24}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27}/g,
	// Generic AWS-like keys
	/AKIA[0-9A-Z]{16}/g,
	// Narrowed generic long token detection: only if near a sensitive key or in JSON-like quoted values.
	/(?:password|pass|secret|token|api[_-]?key|apikey)\s*[":=]\s*"([A-Za-z0-9_\-]{16,})"/gi,
	/"([A-Za-z0-9_\-]{40,})"/g, // long quoted values (40+ chars) - reduces matching plain IDs
];

function isBinary(filePath) {
	const buf = fs.readFileSync(filePath);
	for (let i = 0; i < Math.min(buf.length, 8000); i++) {
		if (buf[i] === 0) return true;
	}
	return false;
}

function scanFile(filePath) {
	if (!fs.existsSync(filePath)) return [];
	if (fs.statSync(filePath).isDirectory()) return [];
	// Exclude common generated and lock files from scanning (noisy)
	const base = path.basename(filePath).toLowerCase();
	if (base === 'package-lock.json' || base === 'yarn.lock' || base.endsWith('.aggregate.json'))
		return [];
	if (filePath.includes(path.sep + 'data' + path.sep + 'backups')) return [];
	if (isBinary(filePath)) return [];
	const content = fs.readFileSync(filePath, 'utf8');
	const hits = [];
	for (const p of patterns) {
		const match = content.match(p);
		if (match) hits.push({ pattern: p.toString(), matches: match.slice(0, 5) });
	}
	return hits;
}

function walk(dir) {
	let results = [];
	// Ensure the provided path exists and is a directory before reading.
	try {
		if (!fs.existsSync(dir)) return results;
		const dirStat = fs.statSync(dir);
		if (!dirStat.isDirectory()) return results;
	} catch (e) {
		// Not accessible or not a directory - skip
		return results;
	}

	let entries;
	try {
		entries = fs.readdirSync(dir);
	} catch (e) {
		// Not a directory or inaccessible - skip
		return results;
	}

	for (const entry of entries) {
		const full = path.join(dir, entry);
		if (entry === 'node_modules' || entry === '.git') continue;
		try {
			const stat = fs.statSync(full);
			if (stat.isDirectory()) {
				results = results.concat(walk(full));
			} else {
				const hits = scanFile(full);
				if (hits.length) results.push({ file: full, hits });
			}
		} catch (e) {
			// ignore unreadable entries
		}
	}
	return results;
}

if (require.main === module) {
	const args = process.argv.slice(2);
	// lint-staged may pass multiple file paths. If no args provided, scan the repo root.
	let results = [];
	if (args.length === 0) {
		results = walk(repoRoot);
	} else {
		for (const a of args) {
			const resolved = path.resolve(a);
			try {
				const stat = fs.statSync(resolved);
				if (stat.isDirectory()) {
					results = results.concat(walk(resolved));
				} else {
					const hits = scanFile(resolved);
					if (hits.length) results.push({ file: resolved, hits });
				}
			} catch (e) {
				// ignore and continue
			}
		}
	}
	if (results.length === 0) {
		console.log('No obvious secrets detected by quick scan.');
		process.exit(0);
	}

	console.log('Potential secrets found:');
	for (const r of results) {
		console.log(`- ${path.relative(repoRoot, r.file)}`);
		for (const h of r.hits) {
			console.log(`  pattern: ${h.pattern}`);
			console.log(`  examples: ${h.matches.join(', ')}`);
		}
	}
	process.exit(2);
}

module.exports = { scanFile, walk };
