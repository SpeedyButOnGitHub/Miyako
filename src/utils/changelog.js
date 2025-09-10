const fs = require("fs");
const path = require("path");
const { cfgPath } = require('./paths');
const crypto = require("crypto");
const { createEmbed } = require('./embeds');

const SNAPSHOT_FILE = cfgPath('changelogSnapshot.json');

function sha1(buf) {
	return crypto.createHash("sha1").update(buf).digest("hex");
}

function walkDir(dir, fileList = []) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		// Ignore noisy or external folders
		if (entry.isDirectory()) {
			if (["node_modules", ".git", ".vscode", "scripts"].includes(entry.name)) continue;
			walkDir(full, fileList);
		} else {
			// Only include code files; skip JSON configs which change frequently
	const rel = path.relative(path.resolve(__dirname, ".."), full).replace(/\\/g, "/");
			const ext = path.extname(entry.name).toLowerCase();
			const isCode = [".js", ".ts", ".mjs", ".cjs"].includes(ext);
			const isConfigJson = rel.startsWith("config/") && ext === ".json";
			if (!isCode || isConfigJson) continue;
			fileList.push(rel);
		}
	}
	return fileList;
}

function createSnapshot(rootDir) {
	const base = path.resolve(rootDir);
	const files = walkDir(base);
	const snap = {};
	for (const rel of files) {
		try {
			const abs = path.join(base, rel);
			const buf = fs.readFileSync(abs);
			const content = buf.toString("utf8");
			snap[rel] = {
				hash: sha1(buf),
				bytes: buf.length,
				lines: content.split(/\r?\n/).length,
			};
		} catch {}
	}
	return snap;
}

function loadSnapshot() {
	try {
		if (fs.existsSync(SNAPSHOT_FILE)) {
			return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
		}
	} catch {}
	return null;
}

function saveSnapshot(snap) {
	try {
		const dir = path.dirname(SNAPSHOT_FILE);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ createdAt: Date.now(), files: snap }, null, 2));
	} catch {}
}

function compareSnapshots(prev, curr) {
	const added = [];
	const removed = [];
	const modified = [];
	const prevFiles = prev ? prev.files || {} : {};
	const currFiles = curr || {};

	const prevKeys = new Set(Object.keys(prevFiles));
	const currKeys = new Set(Object.keys(currFiles));

	for (const k of currKeys) {
		if (!prevKeys.has(k)) {
			added.push({ path: k, meta: currFiles[k] });
		} else if (prevFiles[k].hash !== currFiles[k].hash) {
			const a = prevFiles[k];
			const b = currFiles[k];
			modified.push({
				path: k,
				linesDelta: (b.lines || 0) - (a.lines || 0),
				bytesDelta: (b.bytes || 0) - (a.bytes || 0),
			});
		}
	}
	for (const k of prevKeys) {
		if (!currKeys.has(k)) removed.push({ path: k, meta: prevFiles[k] });
	}

	return { added, removed, modified };
}

function formatBytes(n) {
	const sign = n < 0 ? "-" : "+";
	const abs = Math.abs(n);
	if (abs < 1024) return `${sign}${abs} B`;
	if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
	return `${sign}${(abs / (1024 * 1024)).toFixed(2)} MB`;
}

function buildChangelogEmbed(result) {
	const { added, removed, modified } = result;
	const total = added.length + removed.length + modified.length;
	const embed = createEmbed({
		title: "📜 Changelog since last start",
		color: 0x00b894
	});

	if (total === 0) {
		embed.setDescription("No code changes detected.");
		return embed;
	}

	embed.setDescription(
		`Files changed: ${total} (➕ ${added.length}, ✖️ ${removed.length}, 🔧 ${modified.length})\n` +
		"Showing up to 15 entries."
	);

	const lines = [];
	for (const it of added.slice(0, 5)) lines.push(`➕ ${it.path}`);
	for (const it of removed.slice(0, 5)) lines.push(`✖️ ${it.path}`);
	for (const it of modified.slice(0, 5)) {
		const ld = it.linesDelta === 0 ? "±0" : (it.linesDelta > 0 ? `+${it.linesDelta}` : `${it.linesDelta}`);
		lines.push(`🔧 ${it.path} (${ld} lines, ${formatBytes(it.bytesDelta)})`);
	}
	if (lines.length > 0) embed.addFields({ name: "Changes", value: lines.join("\n").slice(0, 1024) });

	const more = total - Math.min(5, added.length) - Math.min(5, removed.length) - Math.min(5, modified.length);
	if (more > 0) embed.addFields({ name: "More", value: `…and ${more} more file(s).` });

	return embed;
}

async function postStartupChangelog(client, channelId, rootDir = path.resolve(__dirname, "..")) {
	const prev = loadSnapshot();
	const currentFiles = createSnapshot(rootDir);
	const result = compareSnapshots(prev, currentFiles);

	// Save new snapshot early to avoid duplicate diffs on crash; still post based on 'result'
	saveSnapshot(currentFiles);

	// Skip noise-only changes: none by default
	const total = result.added.length + result.removed.length + result.modified.length;
	if (total === 0) return;

	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel) return;

	const embed = buildChangelogEmbed(result);
	await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = {
	postStartupChangelog,
	// Exported for potential testing
	createSnapshot,
	compareSnapshots,
	buildChangelogEmbed,
};
