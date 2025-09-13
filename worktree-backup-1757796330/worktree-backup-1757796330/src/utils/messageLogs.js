const { config } = require("./storage");
const theme = require("./theme");
const { applyStandardFooter } = require("./ui");
const { MESSAGE_LOG_CHANNEL, TEST_LOG_CHANNEL } = require("./logChannels");
const { logError } = require("./errorUtil");
const { createEmbed, safeAddField } = require('./embeds');

async function logMessageDelete(client, message) {
	const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
	const channel = await client.channels.fetch(logChannelId).catch(e => { logError('messageLogs:deleteFetch', e); return null; });
	if (!channel || !message || !message.guild || !message.author || message.author.bot) return;

	const embed = createEmbed({
		title: `${theme.emojis.delete} Message Deleted`,
		description: message.content || "*No content*",
		color: theme.colors.danger
	}).setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) });
	safeAddField(embed, "Channel", `<#${message.channel.id}>`, true);
	applyStandardFooter(embed, message.guild, { testingMode: config.testingMode });

	try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); } catch (e) { logError('messageLogs:deleteSend', e); }
}

async function logMessageEdit(client, oldMessage, newMessage) {
	const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
	const channel = await client.channels.fetch(logChannelId).catch(e => { logError('messageLogs:editFetch', e); return null; });
	if (!channel || !oldMessage || !newMessage) return;
	if (!newMessage.guild || (newMessage.author && newMessage.author.bot)) return;

	const embed = createEmbed({
		title: `${theme.emojis.edit} Message Edited`,
		color: theme.colors.warning
	}).setAuthor({ name: (newMessage.author && newMessage.author.tag) || "Unknown", iconURL: newMessage.author ? newMessage.author.displayAvatarURL({ dynamic: true }) : undefined });
	safeAddField(embed, "Channel", `<#${newMessage.channel.id}>`, true);
	safeAddField(embed, "Before", oldMessage.content || "*No content*");
	safeAddField(embed, "After", newMessage.content || "*No content*");
	applyStandardFooter(embed, newMessage.guild, { testingMode: config.testingMode });

	try { await channel.send({ embeds: [embed] }); } catch (e) { logError('messageLogs:editSend', e); }
}

module.exports = { logMessageDelete, logMessageEdit };
