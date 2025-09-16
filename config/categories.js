const { ButtonStyle } = require('discord.js');
const { config } = require('../utils/storage');

const categories = {
	Sniping: {
		description: 'Settings for sniping commands',
		settings: {
			SnipeMode: {
				description: 'Choose whether to use a whitelist or blacklist for sniping channels.',
				getDisplay: () => (config.snipeMode === 'blacklist' ? 'Blacklist' : 'Whitelist'),
				buttons: [
					{ id: 'setWhitelist', label: 'Whitelist', style: ButtonStyle.Success },
					{ id: 'setBlacklist', label: 'Blacklist', style: ButtonStyle.Danger },
				],
			},
			ChannelList: {
				description: () =>
					config.snipeMode === 'blacklist'
						? 'Channels where snipes are not allowed.'
						: 'Channels where snipes are allowed.',
				getDisplay: () =>
					config.snipingChannelList && config.snipingChannelList.length
						? config.snipingChannelList.map((id) => `<#${id}>`).join('\n')
						: '*None*',
				buttons: [
					{ id: 'addChannel', label: '➕ Add Channel', style: ButtonStyle.Success },
					{ id: 'removeChannel', label: '➖ Remove Channel', style: ButtonStyle.Danger },
				],
			},
		},
	},
	Moderation: {
		description: 'Settings for moderation commands',
		settings: {
			ModeratorRoles: {
				description: 'Roles allowed to use moderation commands',
				getDisplay: () =>
					config.moderatorRoles.length
						? config.moderatorRoles.map((id) => `<@&${id}>`).join('\n')
						: '*None*',
				buttons: [
					{ id: 'addRole', label: '➕ Add Role', style: ButtonStyle.Success },
					{ id: 'removeRole', label: '➖ Remove Role', style: ButtonStyle.Danger },
				],
			},
		},
	},
};

module.exports = {
	categories,
};
