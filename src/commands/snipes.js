const { config } = require('../utils/storage');
const { EmbedBuilder } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const { EMOJI_SUCCESS, EMOJI_ERROR } = require('./moderation/replies');
const fs = require('fs/promises');
// cfgPath not needed here
const SNIPES_FILE = require('../utils/paths').runtimeFile('snipes.json');

const snipes = new Map();
const lastSnipeMessage = new Map();
const lastSnipeEmbedData = new Map();
const deletedSnipes = new Set();

async function loadSnipes() {
	try {
		const raw = JSON.parse(await fs.readFile(SNIPES_FILE, 'utf8'));
		for (const [channelId, snipe] of Object.entries(raw)) {
			snipe.expiresAt = snipe.timestamp + 2 * 60 * 60 * 1000;
			if (snipe.deleted) {
				deletedSnipes.add(channelId);
				if (snipe.embedData) lastSnipeEmbedData.set(channelId, snipe.embedData);
			} else if (snipe.expiresAt > Date.now()) {
				snipes.set(channelId, snipe);
				if (snipe.embedData) lastSnipeEmbedData.set(channelId, snipe.embedData);
			}
		}
	} catch (err) {
		// If file doesn't exist or is invalid, ignore
	}
}
loadSnipes();

async function saveSnipes() {
	const obj = {};
	for (const [channelId, snipe] of snipes.entries()) {
		obj[channelId] = {
			...snipe,
			deleted: false,
			embedData: lastSnipeEmbedData.get(channelId) || null,
		};
	}
	for (const channelId of deletedSnipes) {
		if (!obj[channelId]) {
			obj[channelId] = {
				deleted: true,
				embedData: lastSnipeEmbedData.get(channelId) || null,
			};
		}
	}
	try {
		await fs.writeFile(SNIPES_FILE, JSON.stringify(obj, null, 2));
	} catch (err) {
		try {
			require('../utils/logger').error('[Snipes save error]', { err: err.message });
		} catch {}
	}
}

function formatTodayTime(date) {
	const d = new Date(date);
	const hours = d.getHours().toString().padStart(2, '0');
	const minutes = d.getMinutes().toString().padStart(2, '0');
	return `Today at ${hours}:${minutes}`;
}

function cleanupSnipes() {
	const now = Date.now();
	for (const [channelId, snipe] of snipes.entries()) {
		if (snipe.expiresAt < now) snipes.delete(channelId);
	}
	for (const [channelId, msg] of lastSnipeMessage.entries()) {
		if (!msg || (msg.createdTimestamp && now - msg.createdTimestamp > 2 * 60 * 60 * 1000)) {
			lastSnipeMessage.delete(channelId);
		}
	}
	for (const [channelId, embedData] of lastSnipeEmbedData.entries()) {
		if (embedData && embedData.timestamp && now - embedData.timestamp > 2 * 60 * 60 * 1000) {
			lastSnipeEmbedData.delete(channelId);
		}
	}
}
// Run periodic cleanup, but don't keep the process alive solely for this timer
const _snipeCleanupInterval = setInterval(cleanupSnipes, 60 * 1000);
if (typeof _snipeCleanupInterval.unref === 'function') {
	_snipeCleanupInterval.unref();
}

async function handleSnipeCommands(client, message, command, args) {
	const content = message.content.toLowerCase();

	if (content === '.ds') {
		let replyMsg;
		if (snipes.has(message.channel.id) || deletedSnipes.has(message.channel.id)) {
			snipes.delete(message.channel.id);
			deletedSnipes.add(message.channel.id);
			await saveSnipes();
			replyMsg = await message.reply(`${EMOJI_SUCCESS} Snipe deleted!`).catch(() => null);
			const snipeMsg = lastSnipeMessage.get(message.channel.id);
			if (snipeMsg && snipeMsg.editable) {
				try {
					const oldEmbed = snipeMsg.embeds?.[0];
					if (oldEmbed) {
						const newEmbed = EmbedBuilder.from(oldEmbed)
							.setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
							.setColor(0xff0000);
						await snipeMsg.edit({
							content: null,
							embeds: [newEmbed],
						});
					} else {
						await snipeMsg.edit({
							content: `${EMOJI_ERROR} This snipe has been deleted.`,
							embeds: [],
						});
					}
				} catch (err) {
					try {
						require('../utils/logger').warn('[Snipes edit error]', { err: err.message });
					} catch {}
				}
			}
		} else {
			replyMsg = await message.reply(`${EMOJI_ERROR} No snipe to delete.`).catch(() => null);
		}
		setTimeout(() => {
			try {
				replyMsg?.delete().catch(() => {});
			} catch {}
			try {
				message.delete().catch(() => {});
			} catch {}
		}, 3000);
		return;
	}

	if (content === '.snipe' || content === '.s') {
		// Respect mode: blacklist uses snipingChannelList, whitelist uses snipingWhitelist
		let allowed = true;
		if (config.snipeMode === 'blacklist') {
			allowed = !config.snipingChannelList.includes(message.channel.id);
		} else {
			const list = Array.isArray(config.snipingWhitelist) ? config.snipingWhitelist : [];
			allowed = list.includes(message.channel.id);
		}
		if (!allowed) {
			return message.reply(`${EMOJI_ERROR} Cannot snipe in this channel!`).catch(() => {});
		}

		if (deletedSnipes.has(message.channel.id)) {
			const snipeMsg = lastSnipeMessage.get(message.channel.id);
			if (snipeMsg && snipeMsg.embeds?.[0]) {
				const deletedEmbed = EmbedBuilder.from(snipeMsg.embeds[0])
					.setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
					.setColor(0xff0000);
				return message.reply({ embeds: [deletedEmbed] }).catch(() => {});
			}
			const embedData = lastSnipeEmbedData.get(message.channel.id);
			if (embedData) {
				const deletedEmbed = new EmbedBuilder(embedData)
					.setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
					.setColor(0xff0000);
				return message.reply({ embeds: [deletedEmbed] }).catch(() => {});
			}
			return message.reply(`${EMOJI_ERROR} This snipe has been deleted.`).catch(() => {});
		}

		const snipe = snipes.get(message.channel.id);
		if (!snipe || Date.now() > snipe.expiresAt) {
			return message
				.reply(`${EMOJI_ERROR} No message has been deleted in the past 2 hours.`)
				.catch(() => {});
		}

		const embed = createEmbed({
			description: snipe.content || '*No content (attachment or embed only)*',
			color: 0x5865f2,
		})
			.setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
			.setFooter({ text: formatTodayTime(snipe.timestamp) });

		if (snipe.attachments && snipe.attachments.length > 0) {
			embed.setImage(snipe.attachments[0]);
		}

		const sentMsg = await message.reply({ embeds: [embed] }).catch(() => null);
		if (sentMsg) lastSnipeMessage.set(message.channel.id, sentMsg);
		lastSnipeEmbedData.set(message.channel.id, { ...embed.data, timestamp: Date.now() });
		await saveSnipes();
		return;
	}
}

function handleMessageDelete(message) {
	try {
		if (
			message.partial ||
			message.author?.bot ||
			(message.client && message.author?.id === message.client.user?.id) ||
			(typeof message.content === 'string' && message.content.trim().startsWith('.'))
		)
			return;

		const member = message.member || message.guild?.members?.cache?.get(message.author.id);
		const timestamp = Date.now();
		snipes.set(message.channel.id, {
			content: message.content || '*No text content*',
			nickname: member ? member.displayName : message.author.username,
			avatarURL: member
				? member.displayAvatarURL({ dynamic: true })
				: message.author.displayAvatarURL({ dynamic: true }),
			timestamp,
			attachments: Array.from(message.attachments?.values?.() || []).map((a) => a.url),
			expiresAt: timestamp + 2 * 60 * 60 * 1000,
		});
		saveSnipes();
	} catch {}
}

module.exports = {
	handleSnipeCommands,
	handleMessageDelete,
};
