const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Zero-width characters used for encoding bits
const ZW0 = '\u200B'; // zero width space -> bit 0
const ZW1 = '\u200C'; // zero width non-joiner -> bit 1
const ZWP = '\u200D'; // joiner as small marker

function readSecret() {
	// Prefer explicit env var
	if (process.env.ANCHOR_SECRET && String(process.env.ANCHOR_SECRET).length)
		return String(process.env.ANCHOR_SECRET);
	// Fallback: use package.json hash so different projects differ
	try {
		const pkg = fs.readFileSync(path.resolve('./package.json'), 'utf8');
		return crypto.createHash('sha1').update(pkg).digest('hex');
	} catch {
		return 'miyako-default-secret';
	}
}

function generateToken(eventId) {
	try {
		const secret = readSecret();
		const h = crypto.createHmac('sha256', secret).update(String(eventId)).digest('base64');
		// make filesystem/URL friendly and shorten
		return h.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
	} catch (e) {
		return String(eventId).slice(0, 12);
	}
}

// Encode a short token into a sequence of zero-width characters
function encodeInvisible(token) {
	try {
		const bytes = Buffer.from(String(token), 'utf8');
		let out = ZWP; // prefix
		for (const b of bytes) {
			for (let i = 7; i >= 0; i--) {
				const bit = (b >> i) & 1;
				out += bit ? ZW1 : ZW0;
			}
		}
		out += ZWP; // suffix
		return out;
	} catch (e) {
		return '';
	}
}

// Detects presence of encoded token in a text and returns decoded token (or null)
function findTokenInText(text) {
	try {
		if (!text || typeof text !== 'string') return null;
		const start = text.indexOf(ZWP);
		if (start === -1) return null;
		const end = text.indexOf(ZWP, start + 1);
		if (end === -1) return null;
		const body = text.slice(start + 1, end);
		if (!body) return null;
		const bits = body.split('');
		const bytes = [];
		for (let i = 0; i < bits.length; i += 8) {
			const slice = bits.slice(i, i + 8);
			if (slice.length < 8) break;
			let val = 0;
			for (const ch of slice) {
				val = (val << 1) | (ch === ZW1 ? 1 : 0);
			}
			bytes.push(val);
		}
		return Buffer.from(bytes).toString('utf8');
	} catch (e) {
		return null;
	}
}

module.exports = { generateToken, encodeInvisible, findTokenInText };
