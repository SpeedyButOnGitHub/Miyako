// Utility helpers for safely preparing text for embeds and modal defaults
function safeValue(v, max = 1900) {
	if (v === undefined || v === null) return '';
	const s = typeof v === 'string' ? v : String(v);
	if (s.length > max) return s.slice(0, max - 3) + '...';
	return s;
}

function safeJSONStringify(obj, max = 1900) {
	if (obj === undefined || obj === null) return '';
	try {
		// Try a straightforward stringify first
		const s = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
		if (s.length > max) return s.slice(0, max - 3) + '...';
		return s;
	} catch (e) {
		// Fallback: lightweight preview serializer that truncates long strings/arrays
		const seen = new WeakSet();
		const preview = (v, depth = 0) => {
			if (v === null) return 'null';
			if (typeof v === 'string') return v.length > 200 ? v.slice(0, 197) + '...' : v;
			if (typeof v === 'number' || typeof v === 'boolean') return String(v);
			if (Array.isArray(v)) {
				if (depth > 3) return '[Array]';
				const items = v.slice(0, 8).map((x) => preview(x, depth + 1));
				return '[' + items.join(', ') + (v.length > 8 ? ', ...' : '') + ']';
			}
			if (typeof v === 'object') {
				if (seen.has(v)) return '[Circular]';
				if (depth > 3) return '[Object]';
				seen.add(v);
				const keys = Object.keys(v).slice(0, 12);
				const kv = keys.map((k) => `${k}: ${preview(v[k], depth + 1)}`);
				return '{' + kv.join(', ') + (Object.keys(v).length > keys.length ? ', ...' : '') + '}';
			}
			return String(v);
		};
		try {
			const p = preview(obj);
			if (p.length > max) return p.slice(0, max - 3) + '...';
			return p;
		} catch (e2) {
			return '[JSON]';
		}
	}
}

module.exports = { safeValue, safeJSONStringify };
