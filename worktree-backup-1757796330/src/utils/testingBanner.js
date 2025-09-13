const { EmbedBuilder } = require('discord.js');
const { CONFIG_LOG_CHANNEL } = require('./logChannels');
const theme = require('./theme');
const { applyStandardFooter } = require('./ui');

async function updateTestingStatus(client, enabled, actor) {
	try {
		const channel = await client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
		if (!channel) return;

		const embed = new EmbedBuilder()
			.setTitle(enabled ? `${theme.emojis.warn} Testing Mode Enabled` : `${theme.emojis.success} Testing Mode Disabled`)
			.setColor(enabled ? theme.colors.warning : theme.colors.primary)
			.setDescription(
				enabled
					? `Certain logs will be routed to the test channel. The warnings UI may use seeded data.${actor ? `\nTriggered by: <@${actor.id}>` : ''}`
					: `Bot has returned to normal operation.${actor ? `\nTriggered by: <@${actor.id}>` : ''}`
			)
			.setTimestamp();

		applyStandardFooter(embed, channel.guild, { testingMode: enabled });

		await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
	} catch (err) {
		// noop: avoid throwing on banner update
	}
}

module.exports = { updateTestingStatus };
