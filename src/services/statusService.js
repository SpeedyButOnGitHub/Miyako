// Centralized status service consolidating startup/shutdown status logic
// and channel name updates. Future health/report expansions live here.
const fs = require('fs');
const { createEmbed } = require('../utils/embeds');
const { getRecentErrors, clearErrorLog } = require('../utils/errorUtil');
const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
const { cfgPath } = require('../utils/paths');

const BOT_STATUS_FILE = cfgPath('botStatus.json');

function readLastOnline() {
	try {
		if (fs.existsSync(BOT_STATUS_FILE)) {
			const data = JSON.parse(fs.readFileSync(BOT_STATUS_FILE, 'utf8'));
			return data.lastOnline || 0;
		}
	} catch {}
	return 0;
}

function writeLastOnline(ts = Date.now()) {
	try { fs.writeFileSync(BOT_STATUS_FILE, JSON.stringify({ lastOnline: ts }, null, 2)); } catch {}
}

async function postStartup(client, { channelId = CONFIG_LOG_CHANNEL } = {}) {
	if (!client?.isReady?.()) return;
	const channel = channelId ? await client.channels.fetch(channelId).catch(()=>null) : null;
	const now = Date.now();
	const last = readLastOnline();
	const diff = now - last;
	const restarted = diff >= 5 * 60 * 1000;
	if (channel) {
			// Attach recent error summary (last 5) if any stored
			const recent = getRecentErrors(5);
			const summary = recent.length ? '\n\nRecent Errors:\n' + recent.map(e => `• [${e.scope}] ${e.message.split('\n')[0].slice(0,120)}`).join('\n') : '';
			const embed = createEmbed({
				title: restarted ? '🟢 Restarted' : '🟢 Online',
				description: (restarted ? 'Miyako has restarted and is now online!' : 'Miyako is now online!') + summary,
				color: restarted ? 0x55ff55 : 0x55ff55
			});
			// no-op: startup summary was removed
		// Convert to plain object to keep tests simple and avoid embedding builder internals
		const toSendEmbed = (embed && typeof embed.toJSON === 'function') ? embed.toJSON() : embed;
		await channel.send({ embeds: [toSendEmbed] }).catch(()=>{});
		// Clear stored errors unless retention flag file is present (simple env-based toggle in future)
		clearErrorLog();
	}
	writeLastOnline(now);
	return { lastOnline: last, diff };
}

async function postShutdown(client, { channelId = CONFIG_LOG_CHANNEL } = {}) {
	if (!client?.isReady?.()) return;
	const channel = channelId ? await client.channels.fetch(channelId).catch(()=>null) : null;
	if (channel) {
		const embed = createEmbed({
			title: '🔴 Shutting Down',
			description: 'Miyako is shutting down <:dead:1414023466243330108>.',
			color: 0xff0000
		});
		await channel.send({ embeds: [embed] }).catch(()=>{});
	}
}

async function updateStatusChannelName(client, online, { channelId = CONFIG_LOG_CHANNEL } = {}) {
	if (!client?.isReady?.()) return;
	const channel = channelId ? await client.channels.fetch(channelId).catch(()=>null) : null;
	if (!channel || typeof channel.setName !== 'function') return;
	const name = online ? '🟢ﹱ𝐼𝒢𝒶𝓎𝒶𝓀𝑜-𝐼𝓑𝒶𝓃𝒶' : '🔴ﹱ𝐼𝒢𝒶𝓎𝒶𝓀𝑜-𝐼𝓑𝒶𝓃𝒶';
	await channel.setName(name).catch(()=>{});
}

module.exports = {
	postStartup,
	postShutdown,
	updateStatusChannelName,
	readLastOnline,
	writeLastOnline
};
