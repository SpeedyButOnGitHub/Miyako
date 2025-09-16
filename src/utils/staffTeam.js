const { ROLES, ROLE_ORDER, ROLE_EMOJIS, CHANNEL_ID } = require('../../config/roles');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ALLOWED_ROLES, CHATBOX_BUTTON_ID } = require('../commands/moderation/permissions');

const BOT_PREFIX = '**🌙 Late Night Hours Staff Team**\n\n';

// Reuse centralized constants for roles and chatbox button; keep channel from roles config

const formatMembersListInline = (membersArray) =>
	membersArray.length ? membersArray.map((m) => `<@${m.id}>`).join(', ') : '*None*';

const generateStaffList = async (guild) => {
	await guild.members.fetch();
	let alreadyListed = new Set();
	let output = BOT_PREFIX;

	for (const roleName of ROLE_ORDER) {
		const roleId = ROLES[roleName];
		const emoji = ROLE_EMOJIS[roleName] || '';
		const roleMention = `<@&${roleId}>`;

		const members = guild.members.cache.filter(
			(m) => m.roles.cache.has(roleId) && !alreadyListed.has(m.id),
		);
		members.forEach((m) => alreadyListed.add(m.id));
		const memberList = formatMembersListInline([...members.values()]);

		let header = '# ';
		if (roleName === 'Manager' || roleName === 'Security') header = '## ';
		if (['Staff', 'Trainee', 'Inactive'].includes(roleName)) header = '### ';

		output += `${header}${emoji} ${roleMention} (${members.size})\n${memberList}\n\n`;
	}
	return output;
};

const getStaffMessageRow = () =>
	new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(CHATBOX_BUTTON_ID)
			.setLabel('Open Staff Chatbox')
			.setStyle(ButtonStyle.Primary)
			.setEmoji('💬'),
	);

const updateStaffMessage = async (guild) => {
	try {
		const channel = await guild.channels.fetch(CHANNEL_ID);
		let messages = await channel.messages.fetch({ limit: 50 });
		let staffMessage = messages.find(
			(msg) => msg.author.id === guild.client.user.id && msg.content.startsWith(BOT_PREFIX),
		);
		const newContent = await generateStaffList(guild);

		if (staffMessage) {
			await staffMessage.edit({ content: newContent, components: [getStaffMessageRow()] });
		} else {
			staffMessage = await channel.send({
				content: newContent,
				components: [getStaffMessageRow()],
			});
			try {
				await staffMessage.pin();
			} catch {}
		}
		return staffMessage;
	} catch (err) {
		try {
			require('./logger').error('Failed to update staff message', { err: err.message });
		} catch {}
		return null;
	}
};

module.exports = {
	updateStaffMessage,
	ALLOWED_ROLES,
	CHATBOX_BUTTON_ID,
};
