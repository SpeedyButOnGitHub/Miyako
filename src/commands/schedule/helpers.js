const { config } = require('../../utils/storage');
const { ms } = require('../../utils/time');

// Helper to inject event name placeholder
function applyEventName(str, ev) {
	if (!str || typeof str !== 'string') return str;
	return str.replace(/{{EVENT_NAME}}/g, ev.name || 'Event');
}

function parseOffsetInput(raw) {
	if (!raw) return 0;
	const trimmed = String(raw).trim().toLowerCase();
	if (trimmed === 'start' || trimmed === '0') return 0;
	if (/^-?\d+$/.test(trimmed)) return Math.max(0, parseInt(trimmed, 10));
	let norm = trimmed
		.replace(/minutes?/g, 'm')
		.replace(/hours?/g, 'h')
		.replace(/mins?/g, 'm')
		.replace(/hrs?/g, 'h')
		.replace(/seconds?/g, 's')
		.replace(/secs?/g, 's')
		.replace(/ /g, '');
	let durMs = null;
	try {
		durMs = ms(norm);
	} catch {
		durMs = null;
	}
	if (typeof durMs === 'number' && isFinite(durMs) && durMs >= 0) {
		return Math.round(durMs / 60000);
	}
	const regex = /(\d+)(h|m|s)/g;
	let match;
	let totalMs = 0;
	let any = false;
	while ((match = regex.exec(norm))) {
		any = true;
		const val = parseInt(match[1], 10);
		const unit = match[2];
		if (unit === 'h') totalMs += val * 3600000;
		else if (unit === 'm') totalMs += val * 60000;
		else if (unit === 's') totalMs += val * 1000;
	}
	if (any) return Math.max(0, Math.round(totalMs / 60000));
	return 0;
}

function parseDeleteAfterMs(input) {
	if (!input) return 0;
	const raw = String(input).trim().toLowerCase();
	if (['0', 'off', 'disable', 'disabled', 'none'].includes(raw)) return 0;
	if (/^-?\d+$/.test(raw)) {
		const mins = Math.max(0, parseInt(raw, 10));
		return mins * 60000;
	}
	const norm = raw
		.replace(/minutes?/g, 'm')
		.replace(/hours?/g, 'h')
		.replace(/hrs?/g, 'h')
		.replace(/mins?/g, 'm')
		.replace(/seconds?/g, 's')
		.replace(/secs?/g, 's')
		.replace(/ /g, '');
	let durMs = null;
	try {
		durMs = ms(norm);
	} catch {
		durMs = null;
	}
	if (typeof durMs === 'number' && isFinite(durMs) && durMs >= 0) return Math.floor(durMs);
	const regex = /(\d+)(h|m|s)/g;
	let match;
	let total = 0;
	let any = false;
	while ((match = regex.exec(norm))) {
		any = true;
		const v = parseInt(match[1], 10);
		const u = match[2];
		if (u === 'h') total += v * 3600000;
		else if (u === 'm') total += v * 60000;
		else total += v * 1000;
	}
	if (any) return total;
	return 0;
}

function humanizeMinutes(mins) {
	if (mins === 0) return 'at start';
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	if (h && m) return `${h}h ${m}m before`;
	if (h) return `${h} hour${h === 1 ? '' : 's'} before`;
	return `${m} minute${m === 1 ? '' : 's'} before`;
}

function humanizeMs(msVal) {
	const n = Number(msVal) || 0;
	if (n <= 0) return 'Disabled';
	const sec = Math.round(n / 1000);
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	const parts = [];
	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);
	if (!h && !m && s) parts.push(`${s}s`);
	return parts.join(' ');
}

function sanitizeMentionsForTesting(content) {
	if (!content || typeof content !== 'string') return content;
	return content.replace(/<@&?\d+>/g, (m) => `\`${m}\``);
}

function applyPlaceholdersToJsonPayload(payload, ev) {
	if (!payload || typeof payload !== 'object') return payload;
	const { applyTimestampPlaceholders } = require('../../utils/timestampPlaceholders');
	const repl = (s) => applyTimestampPlaceholders(String(s), ev);
	const sanitize = (s) =>
		config.testingMode ? String(s).replace(/<@&?\d+>/g, (m) => `\`${m}\``) : s;
	const fixStr = (s) => sanitize(repl(s));
	const copy = { ...payload };
	if (typeof copy.content === 'string') copy.content = fixStr(copy.content).slice(0, 2000);
	if (Array.isArray(copy.embeds)) {
		copy.embeds = copy.embeds.map((e) => {
			if (!e || typeof e !== 'object') return e;
			const ee = { ...e };
			if (typeof ee.title === 'string') ee.title = fixStr(ee.title);
			if (typeof ee.description === 'string') ee.description = fixStr(ee.description);
			if (ee.footer && typeof ee.footer.text === 'string')
				ee.footer = { ...ee.footer, text: fixStr(ee.footer.text) };
			if (ee.author && typeof ee.author.name === 'string')
				ee.author = { ...ee.author, name: fixStr(ee.author.name) };
			if (Array.isArray(ee.fields))
				ee.fields = ee.fields.map((f) => {
					if (!f || typeof f !== 'object') return f;
					const ff = { ...f };
					if (typeof ff.name === 'string') ff.name = fixStr(ff.name).slice(0, 256);
					if (typeof ff.value === 'string') ff.value = fixStr(ff.value).slice(0, 1024);
					return ff;
				});
			return ee;
		});
	}
	return copy;
}

module.exports = {
	applyEventName,
	parseOffsetInput,
	parseDeleteAfterMs,
	humanizeMinutes,
	humanizeMs,
	sanitizeMentionsForTesting,
	applyPlaceholdersToJsonPayload,
};
