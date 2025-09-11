const { isModerator } = require('./permissions');
const { config } = require('../../utils/storage');
const { createEmbed } = require('../../utils/embeds');
const { sendModLog } = require('../../utils/modLogs');
const ActiveMenus = require('../../utils/activeMenus');

// Defaults
const DEFAULT_MAX = 200; // hard ceiling even if config sets higher

function getLimits() {
	const max = Math.min(DEFAULT_MAX, Math.max(1, Number(config.maxPurgeLimit || 100)));
	return { max };
}

function isBlacklisted(channelId) {
	const list = Array.isArray(config.blacklistedChannels) ? config.blacklistedChannels : [];
	return list.includes(channelId);
}

function parseArgs(message, args) {
	// Syntax examples:
	// .purge 25
	// .purge 50 @User
	// .purge @User 30
	// .purge 30 user:123456789012345678
	let count = null;
	let userFilter = null;
	for (const a of args) {
		if (/^<@!?\d+>$/.test(a) && !userFilter) {
			userFilter = a.replace(/\D/g, '');
			continue;
		}
		if (/^user:\d+$/.test(a) && !userFilter) {
			userFilter = a.split(':')[1];
			continue;
		}
		if (/^\d+$/.test(a) && !count) {
			count = parseInt(a, 10);
			continue;
		}
	}
	// Extra filters: bots, images, contains:<text>
	let contains = null; let bots = false; let images = false;
	for (const a of args) {
		if (/^bots$/i.test(a)) bots = true;
		else if (/^images?$/i.test(a)) images = true;
		else if (/^contains:/i.test(a)) contains = a.slice(9).replace(/^"|"$/g,'');
	}
	return { count, userFilter, contains, bots, images };
}

async function handlePurgeCommand(client, message, args) {
	if (!isModerator(message.member)) {
		return message.reply({ content: '❌ You lack permission to use this command.', allowedMentions: { repliedUser: false } });
	}
	if (isBlacklisted(message.channelId)) {
		return message.reply({ content: '❌ This channel is blacklisted for purge operations.', allowedMentions: { repliedUser: false } });
	}

	const { count, userFilter, contains, bots, images } = parseArgs(message, args);
	if (!count || count <= 0) {
		return message.reply({ content: 'Usage: `.purge <amount 1-100> [@user]`', allowedMentions: { repliedUser: false } });
	}
	const { max } = getLimits();
	if (count > max) {
		return message.reply({ content: `❌ Amount too large. Max allowed: ${max}.`, allowedMentions: { repliedUser: false } });
	}

	// For large purges (>= 50) require confirmation via button
	const needsConfirm = count >= Math.min(max, 50);
	if (needsConfirm) {
		const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('purge_confirm').setLabel(`Confirm ${count}`).setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setCustomId('purge_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
		);
		const embed = createEmbed({
			title: '⚠️ Confirm Purge',
			description: `This will delete up to **${count}** recent message(s)${userFilter ? ` from <@${userFilter}>` : ''}${contains?` containing "${contains}"`:''}${bots?` (bots only)`:''}${images?` (with images)`:''}. This action cannot be undone.`,
			color: 'warning'
		});
		const sent = await message.reply({ embeds: [embed], components: [row], allowedMentions: { repliedUser: false } });
		ActiveMenus.registerMessage(sent, { type: 'purgeConfirm', userId: message.author.id, data: { count, userFilter, contains, bots, images } });
		return;
	}

	return executePurge(client, message, count, userFilter, { contains, bots, images });
}

async function executePurge(client, message, count, userFilter, filters={}) {
	try {
		// Fetch up to count * 2 to allow filtering by user without extra roundtrips
		const fetchLimit = Math.min(100, Math.max(count, Math.min(count * 2, 100)));
		const messages = await message.channel.messages.fetch({ limit: fetchLimit });
		let filtered = messages;
		if (userFilter) filtered = filtered.filter(m => m.author && m.author.id === userFilter);
		if (filters.bots) filtered = filtered.filter(m => m.author?.bot);
		if (filters.images) filtered = filtered.filter(m => m.attachments?.size > 0);
		if (filters.contains) {
			const needle = filters.contains.toLowerCase();
			filtered = filtered.filter(m => (m.content||'').toLowerCase().includes(needle));
		}
		const toDelete = filtered.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000).first(count);
		if (!toDelete || toDelete.length === 0) {
			return message.reply({ content: 'Nothing to delete (messages may be too old or no matches).', allowedMentions: { repliedUser: false } });
		}
		let deletedCount = 0;
		if (toDelete.length === 1) {
			try { await toDelete[0].delete().catch(()=>{}); deletedCount = 1; } catch {}
		} else {
			// Bulk delete requires collection of message IDs
			const collection = toDelete;
			try {
				const res = await message.channel.bulkDelete(collection, true).catch(()=>null);
				deletedCount = res ? res.size : toDelete.length; // fallback
			} catch (e) {
				// Fallback to sequential if bulk fails
				for (const m of collection) {
					try { await m.delete().catch(()=>{}); deletedCount++; } catch {}
				}
			}
		}
		// Log action
		try {
			const filterParts = [];
			if (userFilter) filterParts.push(`user=<@${userFilter}>`);
			if (filters.contains) filterParts.push(`contains="${filters.contains}"`);
			if (filters.bots) filterParts.push('bots');
			if (filters.images) filterParts.push('images');
			const filterStr = filterParts.length ? ` filters: ${filterParts.join(', ')}` : '';
			await sendModLog(client, message.member || message.author, message.author, 'purged', `${deletedCount} message(s)${filterStr}`, true, null, null);
		} catch {}

		const resultEmbed = createEmbed({
			title: '🧹 Purge Complete',
			description: `Deleted **${deletedCount}** message(s)${userFilter ? ` from <@${userFilter}>` : ''}${filters.contains?` containing "${filters.contains}"`:''}${filters.bots?` (bots only)`:''}${filters.images?` (with images)`:''}.`,
			color: 'success'
		});
		try { await message.reply({ embeds: [resultEmbed], allowedMentions: { repliedUser: false } }); } catch {}
	} catch (err) {
		try { require('../../utils/logger').error('[purge] error', { err: err.message }); } catch {}
		try { await message.reply({ content: `Error during purge: ${err.message || err}`, allowedMentions: { repliedUser: false } }); } catch {}
	}
}

module.exports = { handlePurgeCommand, executePurge };
