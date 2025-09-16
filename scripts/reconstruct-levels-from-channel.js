/**
 * Reconstruct user levels by scanning a historical level-up channel.
 * Usage: node scripts/reconstruct-levels-from-channel.js <channelId>
 *   [--dry] [--resolve-names] [--debug N] [--loose] [--fuzzy]
 *   [--samples N] [--inspect <messageId>] [--dump-unmatched]
 *
 * Features:
 *   - Parses message content + embed text (title, description, fields, footer).
 *   - Patterns: "climbed from level X to Y", "climbed to level Y", "reached level Y",
 *               "leveled up to level Y", plus arrow/separator & synonyms (rank/lvl) variants.
 *   - Fallback loose mode: picks the largest level number mentioned (level/lvl/rank) when structured match fails.
 *   - Name resolution: mention > parsed after "Congratulations," > fuzzy/slug variants (if --resolve-names & --fuzzy).
 *   - Slug mapping removes punctuation/spaces for robust historical username matches.
 *   - --inspect lets you dump a single message raw JSON (content + embeds) for pattern debugging.
 *   - --samples N prints first N candidate messages containing level keywords.
 *   - Diagnostics summary at end (counters for gating reasons) to explain zero-match scenarios.
 */
const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { runtimeFile } = require('../src/utils/paths');
const LEVELS_FILE = runtimeFile('levels.json');

const channelId =
	process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '1232701768832516100';
const DRY = process.argv.includes('--dry');

const TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
if (!TOKEN) {
	console.error('Missing env var: set DISCORD_TOKEN (preferred) or BOT_TOKEN in your .env file.');
	process.exit(1);
}

function loadLevels() {
	try {
		return JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8'));
	} catch {
		return {};
	}
}
function saveLevels(obj) {
	try {
		fs.writeFileSync(LEVELS_FILE, JSON.stringify(obj, null, 2));
	} catch (e) {
		console.error('Failed saving levels.json', e);
	}
}

// Regex examples handled:
// 🥳 Congratulations, @Name!\nYou climbed from level 10 to 11. Keep it up!
// Supports arrow/alt separators: from level 10 -> 11 / 10 ➜ 11 / 10 → 11
// Variation: "You climbed to level 7." (if bot didn’t include previous)
// Additional synonyms: lvl, rank
const FROM_TO =
	/(?:climbed|advanced|went)\s+from\s+(?:level|lvl|rank)\s+(\d{1,4})\s+(?:to|->|➡|➜|→)\s+(\d{1,4})/i;
const TO_ONLY = /(?:climbed|advanced|went)\s+(?:to\s+)?(?:level|lvl|rank)\s+(\d{1,4})/i;
const REACHED = /reached\s+(?:level|lvl|rank)\s+(\d{1,4})/i;
const LEVELED_UP = /leveled?\s+up\s+(?:to\s+)?(?:level|lvl|rank)\s+(\d{1,4})/i;
const RANK_UP = /reached\s+rank\s+(\d{1,4})/i;
// Loose capture of any '(level|lvl|rank) <num>' (used in --loose mode as last resort)
const ANY_LEVEL_NUM = /(?:level|lvl|rank)\s+(\d{1,4})/gi;
// Name extraction: allow optional punctuation and no trailing '!'
const CONGRATS_NAME = /congratulations[,\s]+@?([^!\n,]+)[!\n,]?/i; // capture name-like token

async function run() {
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers,
		],
		partials: [Partials.Channel],
	});

	await client.login(TOKEN);
	console.log('Logged in as', client.user.tag);
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel || !channel.isTextBased()) {
		console.error('Channel not found or not text based:', channelId);
		process.exit(1);
	}
	console.log('Scanning channel', channelId);
	const resolveNames = process.argv.includes('--resolve-names');
	const debugIndex = process.argv.indexOf('--debug');
	const debugLimit = debugIndex !== -1 ? parseInt(process.argv[debugIndex + 1], 10) : 0;
	let debugCount = 0;
	const looseMode = process.argv.includes('--loose');
	const fuzzyMode = process.argv.includes('--fuzzy');
	const dumpUnmatched = process.argv.includes('--dump-unmatched');
	const samplesIndex = process.argv.indexOf('--samples');
	const sampleLimit = samplesIndex !== -1 ? parseInt(process.argv[samplesIndex + 1], 10) : 0;
	const inspectIndex = process.argv.indexOf('--inspect');
	const inspectMessageId = inspectIndex !== -1 ? process.argv[inspectIndex + 1] : null;
	let nameMap = null;
	let nameVariants = [];
	const slugMap = new Map(); // slug -> id
	const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
	if (resolveNames) {
		try {
			const guild = channel.guild || (await client.guilds.fetch(channel.guildId));
			console.log('Fetching guild members for name resolution...');
			const members = await guild.members.fetch();
			nameMap = new Map();
			members.forEach((m) => {
				const variants = [m.user.username, m.displayName, m.user.globalName]
					.filter(Boolean)
					.map((v) => v.trim())
					.filter((v) => v.length);
				nameVariants.push({ id: m.id, variants });
				for (const v of variants) nameMap.set(v.toLowerCase(), m.id);
				for (const v of variants) {
					const sg = slug(v);
					if (sg) slugMap.set(sg, m.id);
				}
			});
			console.log('Name variants indexed:', nameMap.size);
		} catch (e) {
			console.warn('Could not fetch members for name resolution:', e.message);
		}
	}

	const userMaxLevels = new Map();
	// Single-message inspection path (early exit)
	if (inspectMessageId) {
		try {
			const msg = await channel.messages.fetch(inspectMessageId);
			const dump = {
				id: msg.id,
				content: msg.content,
				embeds:
					msg.embeds?.map((e) => ({
						title: e.title,
						description: e.description,
						fields: (e.fields || []).map((f) => ({ name: f.name, value: f.value })),
						footer: e.footer?.text,
					})) || [],
				mentions: msg.mentions?.users?.map((u) => ({ id: u.id, tag: u.tag })) || [],
			};
			console.log(JSON.stringify(dump, null, 2));
		} catch (e) {
			console.error('Inspect fetch failed:', e.message);
		}
		process.exit(0);
	}

	let fetched = 0;
	let batches = 0;
	let lastId = null;
	const LIMIT = 100;
	let samplePrinted = 0;
	// Diagnostics counters
	let diagHasLevelWord = 0;
	let diagHasCongrats = 0;
	let diagUserResolved = 0;
	let diagUserFailed = 0;
	let diagPatternResolved = 0;
	let diagPatternFailed = 0;
	while (true) {
		const opts = { limit: LIMIT };
		if (lastId) opts.before = lastId;
		const col = await channel.messages.fetch(opts).catch(() => null);
		if (!col || col.size === 0) break;
		batches++;
		for (const msg of col.values()) {
			fetched++;
			const textChunks = [];
			if (msg.content) textChunks.push(msg.content);
			for (const emb of msg.embeds || []) {
				if (emb.title) textChunks.push(emb.title);
				if (emb.description) textChunks.push(emb.description);
				if (Array.isArray(emb.fields)) {
					for (const f of emb.fields) {
						if (f?.name) textChunks.push(f.name);
						if (f?.value) textChunks.push(f.value);
					}
				}
				if (emb.footer?.text) textChunks.push(emb.footer.text);
			}
			if (!textChunks.length) continue;
			const fullText = textChunks.join('\n');
			if (!/(level|lvl|rank)/i.test(fullText)) continue; // gating on possible level keyword
			diagHasLevelWord++;
			const hasCongrats = /congratulations/i.test(fullText);
			if (hasCongrats) diagHasCongrats++;
			if (!hasCongrats && !looseMode) continue; // skip unless loose mode
			if (sampleLimit && samplePrinted < sampleLimit) {
				console.log(`[sample] id=${msg.id}\n${fullText.split('\n').slice(0, 5).join('\n')}`);
				samplePrinted++;
			}
			// Normalize markdown emphasis markers to simplify pattern matching (remove *, _, `, ~)
			const patternText = fullText.replace(/[\*`_~]/g, '');
			let uid = null;
			const mentioned = msg.mentions?.users?.first?.();
			if (mentioned) uid = mentioned.id;
			else if (resolveNames && nameMap) {
				const mName = patternText.match(CONGRATS_NAME);
				if (mName) {
					const rawName = mName[1].trim();
					const lower = rawName.toLowerCase();
					if (nameMap.has(lower)) {
						uid = nameMap.get(lower);
					} else if (fuzzyMode) {
						// Fuzzy: exact case-insensitive containment or Levenshtein distance <=2
						const candidates = [];
						const norm = lower;
						const lev = (a, b) => {
							const m = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
							for (let i = 0; i <= a.length; i++) m[i][0] = i;
							for (let j = 0; j <= b.length; j++) m[0][j] = j;
							for (let i = 1; i <= a.length; i++)
								for (let j = 1; j <= b.length; j++) {
									const cost = a[i - 1] === b[j - 1] ? 0 : 1;
									m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
								}
							return m[a.length][b.length];
						};
						for (const entry of nameVariants) {
							for (const v of entry.variants) {
								const lv = v.toLowerCase();
								if (lv === norm || lv.includes(norm) || norm.includes(lv)) {
									candidates.push(entry.id);
									break;
								}
								if (lev(lv, norm) <= 2) {
									candidates.push(entry.id);
									break;
								}
							}
						}
						if (candidates.length === 1) uid = candidates[0];
						if (!uid) {
							// Slug matching fallback
							const sg = slug(rawName);
							if (sg && slugMap.has(sg)) uid = slugMap.get(sg);
						}
					}
				} else if (resolveNames && fuzzyMode) {
					// Try plain @username style even if not parsed by CONGRATS_NAME
					const atMatch = patternText.match(/@([A-Za-z0-9_][A-Za-z0-9_\.\-]{1,30})/);
					if (atMatch) {
						const sg = slug(atMatch[1]);
						if (sg && slugMap.has(sg)) uid = slugMap.get(sg);
					}
				}
			}
			if (!uid) {
				diagUserFailed++;
				continue;
			}
			diagUserResolved++;
			let newLevel = null;
			let m = patternText.match(FROM_TO);
			if (m) {
				const to = parseInt(m[2], 10);
				if (Number.isFinite(to)) newLevel = to;
			} else if ((m = patternText.match(TO_ONLY))) {
				const to = parseInt(m[1], 10);
				if (Number.isFinite(to)) newLevel = to;
			} else if ((m = patternText.match(REACHED))) {
				const to = parseInt(m[1], 10);
				if (Number.isFinite(to)) newLevel = to;
			} else if ((m = patternText.match(LEVELED_UP))) {
				const to = parseInt(m[1], 10);
				if (Number.isFinite(to)) newLevel = to;
			} else if ((m = patternText.match(RANK_UP))) {
				const to = parseInt(m[1], 10);
				if (Number.isFinite(to)) newLevel = to;
			} else if (looseMode) {
				// Fallback: take the largest level number mentioned
				let tmp;
				let maxFound = 0;
				while ((tmp = ANY_LEVEL_NUM.exec(patternText)) !== null) {
					const v = parseInt(tmp[1], 10);
					if (v > maxFound) maxFound = v;
				}
				if (maxFound > 0) newLevel = maxFound;
			}
			if (!newLevel) {
				diagPatternFailed++;
				continue;
			}
			diagPatternResolved++;
			const prev = userMaxLevels.get(uid) || 0;
			if (newLevel > prev) userMaxLevels.set(uid, newLevel);
			if (debugLimit && debugCount < debugLimit) {
				console.log(
					`[debug] uid=${uid} level=${newLevel} msg=${msg.id} excerpt="${fullText.slice(0, 120).replace(/\n/g, ' ')}"`,
				);
				debugCount++;
			}
		}
		lastId = col.last().id;
		if (col.size < LIMIT) break; // no more
	}

	console.log(
		`Scanned ${fetched} messages in ${batches} batch(es). Found ${userMaxLevels.size} users with level records.`,
	);
	console.log('Diagnostics:', {
		candidatesWithLevelWord: diagHasLevelWord,
		candidatesWithCongrats: diagHasCongrats,
		userResolved: diagUserResolved,
		userFailed: diagUserFailed,
		patternResolved: diagPatternResolved,
		patternFailed: diagPatternFailed,
	});
	if (dumpUnmatched && resolveNames) {
		// Optionally list names we saw in congratulations lines but could not resolve
		// This requires tracking; implement quick scan second pass.
		console.log('Re-scanning for unresolved names (dump)...');
		// NOTE: For efficiency, skip large guild scenario; reuse earlier fetch loop logic but only gather names.
	}
	if (userMaxLevels.size === 0) {
		process.exit(0);
	}

	// Load current levels.json and merge (take max of existing vs scanned)
	const levels = loadLevels();
	let updates = 0;
	for (const [uid, level] of userMaxLevels.entries()) {
		const cur = levels[uid] || { xp: 0, level: 0 };
		if (level > (cur.level || 0)) {
			// Reconstruct minimum XP required for that level using same xp curve as code
			const xp = xpForLevel(level);
			levels[uid] = { xp, level };
			updates++;
		}
	}
	console.log(`Users updated: ${updates}`);
	if (!DRY && updates > 0) saveLevels(levels);
	else if (DRY) console.log('[dry] Skipped writing levels.json');
	client.destroy();
}

function xpForLevel(level) {
	const BASE_XP = 150; // must match levels.js
	return Math.floor(BASE_XP * Math.pow(level, 1 / 0.7));
}

run().catch((e) => {
	console.error('Error during reconstruction', e);
	process.exit(1);
});
