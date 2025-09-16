// Centralized theme moved to src/ui/theme.js (Phase 2 restructure)
const fs = require('fs');
const { cfgPath } = require('../utils/paths');
let external = null;
try {
	const ext = cfgPath('theme.json');
	if (fs.existsSync(ext)) external = JSON.parse(fs.readFileSync(ext, 'utf8'));
} catch {
	external = null;
}

const baseTheme = {
	colors: {
		primary: 0x5865f2,
		success: 0x00ff00,
		warning: 0xffd700,
		danger: 0xff5555,
		neutral: 0x2f3136,
	},
	emojis: {
		info: 'ℹ️',
		success: '✅',
		warn: '⚠️',
		danger: '🚨',
		error: '❌',
		duration: '⏰',
		counter: '🧮',
		id: '🆔',
		create: '➕',
		delete: '➖',
		back: '⬅️',
		select: '🎯',
		events: '📅',
		times: '🕒',
		days: '📅',
		message: '📝',
		enable: '✅',
		disable: '🛑',
		toggle: '🔁',
		settings: '⚙️',
		edit: '✏️',
		profile: '👤',
		rank: '📊',
		leaderboard: '🏆',
		bank: '🏦',
		cash: '💸',
		deposit: '📈',
		withdraw: '📉',
		vc: '🎙️',
		text: '💬',
		action: '🧰',
		target: '🎯',
		moderator: '🛡️',
		mute: '🔇',
		unmute: '🔊',
		kick: '👢',
		ban: '🔨',
		close: '✖',
	},
};

const theme = Object.assign({}, baseTheme, external || {});
theme.color = function (name, fallback = 0x2f3136) {
	return (theme.colors || {})[name] ?? fallback;
};
theme.emoji = function (name, fallback = '❔') {
	return (theme.emojis || {})[name] ?? fallback;
};
module.exports = theme;
