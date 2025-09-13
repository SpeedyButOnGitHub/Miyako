const { config } = require('./storage');
const theme = require('./theme');
const { applyStandardFooter } = require('./ui');
const { MEMBER_LEAVE_LOG_CHANNEL, TEST_LOG_CHANNEL } = require('./logChannels');
const { logError } = require('./errorUtil');
const { createEmbed, safeAddField } = require('./embeds');

/**
 * Logs when a member leaves the guild.
 */
async function logMemberLeave(client, member, isTest = false) {
	const logChannelId = config.testingMode || isTest ? TEST_LOG_CHANNEL : MEMBER_LEAVE_LOG_CHANNEL;
	let channel = null;
	try { channel = await client.channels.fetch(logChannelId).catch(() => null); } catch (e) { logError('memberLogs:fetch', e); }
	if (!channel || !member || !member.user) return;

	const joinedAt = member.joinedTimestamp;
	const leftAt = Date.now();
	let duration = 'Unknown';
	if (joinedAt) {
		const diffMs = leftAt - joinedAt;
		const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
		const mins = Math.floor((diffMs / (1000 * 60)) % 60);
		duration = `${days}d ${hours}h ${mins}m`;
	}

	const embed = createEmbed({
		title: `${theme.emojis.warn} Member Left`,
		color: theme.colors.warning
	}).setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) });
	safeAddField(embed, 'Member', `<@${member.id}>`, true);
	safeAddField(embed, 'Joined', joinedAt ? `<t:${Math.floor(joinedAt / 1000)}:R>` : 'Unknown', true);
	safeAddField(embed, 'Time in Server', duration, true);
	applyStandardFooter(embed, member.guild, { testingMode: config.testingMode });

	try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); } catch (e) { logError('memberLogs:send', e); }
}

module.exports = {
	logMemberLeave
};
