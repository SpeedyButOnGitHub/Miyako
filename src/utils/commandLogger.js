// In-memory + file-based command logger with optional channel reporting and expected vs actual diffing
const { config } = require('../utils/storage');
const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'command_logs.json');

const state = {
	logs: [],
	lastSendTs: 0,
};

function getLimit() {
	const cfg = config.commandLogging || {};
	const max = Number(cfg.maxEntries); return Number.isFinite(max) && max > 0 ? Math.min(max, 5000) : 500;
}

function enabled() {
	const cfg = config.commandLogging || {};
	// Enabled by default; allow opt-out via config.commandLogging.enabled === false
	return cfg.enabled !== false;
}

function add(log) {
	if (!enabled()) return;
	const limit = getLimit();
	state.logs.push(log);
	if (state.logs.length > limit) state.logs.splice(0, state.logs.length - limit);
}

function start(ctx) {
	if (!enabled()) return null;
	const now = Date.now();
	return {
		id: `${ctx.name}:${ctx.userId}:${now}`,
		t0: now,
		...ctx,
	};
}

function finish(client, startCtx, result) {
	if (!enabled() || !startCtx) return;
	const dt = Date.now() - (startCtx.t0 || Date.now());
	const entry = {
		ts: Date.now(),
		dt,
		...startCtx,
		...result,
	};
	add(entry);
	maybeReport(client, entry);
	persist(entry);
}

function sanitizeString(s) {
	try {
		if (!s || typeof s !== 'string') return s;
		// Redact token-like strings: long base64ish strings
		let out = s.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]');
		// Remove common secrets keys if present (defense-in-depth)
		out = out.replace(/(token|apikey|api_key|authorization)\s*[:=]\s*[^\s]+/ig, '$1: [redacted]');
		// collapse long runs of dashes/backticks to avoid formatting blocks
		return out.replace(/-{3,}|`{3,}/g, '');
	} catch { return s; }
}

function mapEmbeds(embeds) {
	try {
		if (!Array.isArray(embeds)) return [];
		return embeds.map(e => {
			const raw = typeof e?.toJSON === 'function' ? e.toJSON() : e;
			// Shallow sanitize content-like fields
			const safe = {};
			for (const [k, v] of Object.entries(raw || {})) {
				if (typeof v === 'string') safe[k] = sanitizeString(v).slice(0, 4000);
				else safe[k] = v;
			}
			return safe;
		});
	} catch { return []; }
}

function mapComponents(components) {
	try {
		if (!Array.isArray(components)) return [];
		// Keep a summarised but useful shape
		return components.map(row => {
			const comps = Array.isArray(row?.components) ? row.components : (row?.data?.components || []);
			return {
				type: row?.type || row?.data?.type || 'row',
				components: comps.map(c => ({
					type: c?.type || c?.data?.type,
					custom_id: c?.customId || c?.data?.custom_id,
					label: c?.label || c?.data?.label,
					style: c?.style || c?.data?.style,
					disabled: !!(c?.disabled || c?.data?.disabled),
				}))
			};
		});
	} catch { return []; }
}

function normalizeMsgShape(msg) {
	if (!msg) return null;
	const embeds = Array.isArray(msg.embeds) ? msg.embeds : (msg.embeds ? [msg.embeds] : []);
	const comps = Array.isArray(msg.components) ? msg.components : [];
	return {
		id: msg.id,
		type: 'message',
		content: sanitizeString((msg.content || '')).slice(0, 1800),
		embeds: mapEmbeds(embeds),
		components: mapComponents(comps),
		embedsCount: embeds.length,
		componentsCount: comps.length,
	};
}

function diffExpected(actual, expected) {
	if (!expected || !actual) return null;
	try {
		const diffs = [];
		if (typeof expected.content === 'string') {
			const a = (actual.content || '').trim(); const e = expected.content.trim();
			if (e && a !== e) diffs.push(`content mismatch`);
		}
		if (typeof expected.embedsCount === 'number') {
			if ((actual.embedsCount || 0) !== expected.embedsCount) diffs.push(`embedsCount ${actual.embedsCount} != ${expected.embedsCount}`);
		}
		if (typeof expected.componentsCount === 'number') {
			if ((actual.componentsCount || 0) !== expected.componentsCount) diffs.push(`componentsCount ${actual.componentsCount} != ${expected.componentsCount}`);
		}
		return diffs.length ? diffs : null;
	} catch { return null; }
}

async function maybeReport(client, entry) {
	try {
		const cfg = config.commandLogging || {};
		if (!cfg.sendToChannel && !cfg.testingCompare) return;
		// Only send if diff in testing mode, or explicit sendToChannel enabled
		const want = (config.testingMode && cfg.testingCompare && entry.diff) || cfg.sendToChannel;
		if (!want) return;
		const now = Date.now();
		const minGap = Number(cfg.sendIntervalMs) || 5000;
		if (now - state.lastSendTs < minGap) return; // rate-limit
		state.lastSendTs = now;
		const channelId = cfg.logChannelId || CONFIG_LOG_CHANNEL;
		if (!channelId) return;
		const ch = await client.channels.fetch(channelId).catch(()=>null);
		if (!ch || !ch.send) return;
		const parts = [];
		parts.push(`🧪 Cmd: ${entry.name} • by <@${entry.userId}> in <#${entry.channelId}> • ${entry.dt}ms`);
		if (entry.diff && entry.diff.length) parts.push(`Diff: ${entry.diff.join('; ')}`);
		if (entry.params && Object.keys(entry.params).length) parts.push(`Args: ${JSON.stringify(entry.params).slice(0, 300)}`);
		await ch.send({ content: parts.join('\n') }).catch(()=>{});
	} catch {}
}

function getLogs() { return state.logs.slice(-getLimit()); }
function clearLogs() { state.logs = []; }
function ensureLogDir() { try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {} }
function persist(entry) {
	try {
		ensureLogDir();
		// Build a stable, readable record
		const verbose = !!(config.commandLogging && config.commandLogging.verbose);
		const record = {
			ts: entry.ts,
			name: entry.name,
			userId: entry.userId,
			channelId: entry.channelId,
			guildId: entry.guildId,
			input: entry.input || entry.params || null,
			output: entry.actual || entry.output || null,
			dt: entry.dt,
			meta: entry.meta || null,
			...(verbose ? { expected: entry.expected || null, diff: entry.diff || null } : {})
		};
		const safe = JSON.stringify(record, null, 2);
		fs.appendFile(LOG_FILE, safe + '\n', () => {}); // async append; ignore errors
	} catch {}
}

// Wrap an interaction's reply/update methods to automatically log outputs
function instrumentInteractionLogging(interaction) {
	if (!enabled()) return;
	if (interaction.__commandLoggingWrapped) return;
	interaction.__commandLoggingWrapped = true;
	const safeInput = () => {
		try {
			const base = {
				type: interaction.type,
				id: interaction.id,
				customId: interaction.customId || null,
				commandName: interaction.commandName || null,
			};
			// Buttons/selects
			try {
				if (typeof interaction.isButton === 'function' && interaction.isButton()) {
					base.kind = 'button';
					base.messageId = interaction.message?.id || null;
				} else if (typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu()) {
					base.kind = 'string_select';
					base.messageId = interaction.message?.id || null;
					base.values = Array.isArray(interaction.values) ? interaction.values.slice(0, 25).map(v => sanitizeString(String(v)).slice(0, 200)) : undefined;
				}
			} catch {}
			// Slash/chat input options
			try {
				if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
					const data = interaction.options?.data;
					if (Array.isArray(data)) {
						base.kind = 'chat_input';
						base.options = data.map(d => ({ name: d?.name, value: sanitizeString(String(d?.value ?? '')).slice(0, 500) }));
					}
				}
			} catch {}
			// Modal submit fields
			try {
				if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()) {
					base.kind = 'modal_submit';
					const fields = [];
					const coll = interaction.fields && interaction.fields.fields ? interaction.fields.fields : null;
					if (coll && typeof coll.forEach === 'function') {
						coll.forEach((comp, key) => {
							let val = null;
							try { if (typeof interaction.fields.getTextInputValue === 'function') val = interaction.fields.getTextInputValue(key); } catch {}
							if (val != null) fields.push({ id: key, value: sanitizeString(String(val)).slice(0, 1000) });
						});
					}
					// Fallback: try common ids if collection not enumerable
					if (!fields.length && typeof interaction.fields?.getTextInputValue === 'function') {
						const common = ['reason','amount','notes','input','value'];
						for (const k of common) {
							try {
								const v = interaction.fields.getTextInputValue(k);
								if (v != null && v !== '') fields.push({ id: k, value: sanitizeString(String(v)).slice(0, 1000) });
							} catch {}
						}
					}
					base.fields = fields;
				}
			} catch {}

			// Verbose: member/user and role names
			try {
				const verbose = !!(config.commandLogging && config.commandLogging.verbose);
				if (verbose) {
					if (interaction.user) {
						const tag = interaction.user.tag || interaction.user.username || null;
						if (tag) base.userTag = sanitizeString(String(tag)).slice(0, 100);
					}
					const dn = interaction.member?.displayName || interaction.member?.nickname || null;
					if (dn) base.memberDisplayName = sanitizeString(String(dn)).slice(0, 100);
					const rolesCache = interaction.member?.roles?.cache;
					if (rolesCache && typeof rolesCache.map === 'function') {
						const arr = rolesCache.map(r => ({ id: r.id, name: sanitizeString(String(r.name || '')).slice(0, 100) }));
						base.memberRoles = Array.isArray(arr) ? arr.slice(0, 25) : undefined;
					}
				}
			} catch {}
			return base;
		} catch { return {}; }
	};
	const meta = {
		userId: interaction.user?.id,
		channelId: interaction.channelId,
		guildId: interaction.guildId,
	};
	const makeStart = (name) => start({ name, userId: meta.userId, channelId: meta.channelId, guildId: meta.guildId, input: safeInput() });
	const wrap = (methodName) => {
		if (typeof interaction[methodName] !== 'function') return;
		const original = interaction[methodName].bind(interaction);
		interaction[methodName] = async function wrapped(options, ...rest) {
			let ctx = null;
			try {
				const baseName = interaction.commandName ? `slash:${interaction.commandName}` : (interaction.customId ? `ui:${interaction.customId}` : `interaction:${methodName}`);
				ctx = makeStart(baseName);
			} catch {}
			let result;
			try { result = await original(options, ...rest); } catch (e) {
				// Log the failure as well
				try { finish(interaction.client, ctx, { output: shapeFromOptions(options), error: String(e && e.message || e) }); } catch {}
				throw e;
			}
			try { finish(interaction.client, ctx, { output: shapeFromOptions(options) }); } catch {}
			return result;
		};
	};
	['reply','followUp','editReply','update'].forEach(wrap);
}

function shapeFromOptions(options) {
	try {
		if (!options) return null;
		if (typeof options === 'string') return { content: sanitizeString(options) };
		const content = options.content ? sanitizeString(options.content).slice(0, 1800) : undefined;
		const embeds = options.embeds ? mapEmbeds(options.embeds) : undefined;
		const components = options.components ? mapComponents(options.components) : undefined;
		return { content, embeds, components };
	} catch { return null; }
}

module.exports = { start, finish, getLogs, clearLogs, normalizeMsgShape, diffExpected, instrumentInteractionLogging, shapeFromOptions };
