const { buildRootEmbed, buildCategorySelect, buildCategoryEmbed, buildSettingEmbed, buildSettingSelect, buildSettingRow, renderSettingEmbed } = require('./render');
const { handleButton } = require('./handlers');
const { OWNER_ID } = require('../moderation/permissions');
const { config, saveConfig } = require('../../utils/storage');
const { logConfigChange } = require('../../utils/configLogs');
const ActiveMenus = require('../../utils/activeMenus');

function buildRootComponents(currentCat) {
	// buildCategorySelect already returns an array of ActionRowBuilders; return directly (avoid nested array)
	return buildCategorySelect(currentCat || null);
}

async function handleConfigMenuCommand(message) {
	if (String(message.author.id) !== String(OWNER_ID)) {
		await message.reply({ content: 'Only the Owner can use this.' });
		return;
	}
	const embed = buildRootEmbed();
	const components = buildRootComponents();
	let sent;
	try {
		sent = await message.channel.send({ embeds: [embed], components });
	} catch (e) {
		console.error('[configMenu] send failed', e);
		try { await message.reply({ content: 'Failed to open config menu (logged).', flags: 1<<6 }); } catch {}
		return;
	}
	ActiveMenus.registerMessage(sent, { type: 'configMenu', userId: message.author.id, data: { view: 'root' } });
}

// ActiveMenus handler
ActiveMenus.registerHandler('configMenu', async (interaction, session) => {
	if (!interaction.isButton() && !interaction.isModalSubmit()) return;
	if (interaction.user.id !== session.userId) {
		if (interaction.isRepliable()) return interaction.reply({ content: 'Not your session.', flags: 1<<6 }).catch(()=>{});
		return;
	}
	try {
		if (interaction.isButton()) {
			const id = interaction.customId;
			// Category navigation
			if (id.startsWith('cfg:cat:')) {
				const categoryName = id.split(':')[2];
				session.data.view = 'category';
				session.data.category = categoryName;
				const catRows = buildCategorySelect(categoryName);
				const setRows = buildSettingSelect(categoryName);
				return interaction.update({ embeds: [buildCategoryEmbed(categoryName)], components: [...catRows, ...setRows].slice(0,5) });
			}
			if (id.startsWith('cfg:set:')) {
				const [, , catName, settingName] = id.split(':');
				session.data.view = 'setting';
				session.data.category = catName; session.data.setting = settingName;
				const catRows = buildCategorySelect(catName);
				const settingRows = buildSettingRow(catName, settingName);
				return interaction.update({ embeds: [buildSettingEmbed(catName, settingName)], components: [...catRows, ...settingRows].slice(0,5) });
			}
			if (id.startsWith('config:')) {
				// legacy setting action buttons
				const parts = id.split(':').slice(1); // category:setting:action
				await handleButton(interaction, parts);
				return;
			}
			if (id.startsWith('settingMode_')) {
				const [, cat, key, mode] = id.split('_');
				if (cat === 'Sniping' && key === 'ChannelList') {
					const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
					if (config.snipeMode !== newMode) { config.snipeMode = newMode; await saveConfig(); try { await logConfigChange(interaction.client, { user: interaction.user, change: `Set Sniping mode to ${newMode}.` }); } catch {} }
					const catRows = buildCategorySelect(cat);
					const rows = buildSettingRow('Sniping', 'ChannelList');
					return interaction.update({ embeds: [buildSettingEmbed('Sniping', 'ChannelList')], components: [...catRows, ...rows].slice(0,5) });
				}
				if (cat === 'Leveling' && key === 'LevelingChannels') {
					const newMode = mode === 'whitelist' ? 'whitelist' : 'blacklist';
					if (config.levelingMode !== newMode) { config.levelingMode = newMode; await saveConfig(); try { await logConfigChange(interaction.client, { user: interaction.user, change: `Set Leveling mode to ${newMode}.` }); } catch {} }
					const catRows = buildCategorySelect(cat);
					const rows = buildSettingRow('Leveling', 'LevelingChannels');
					return interaction.update({ embeds: [buildSettingEmbed('Leveling', 'LevelingChannels')], components: [...catRows, ...rows].slice(0,5) });
				}
				return;
			}
		} else if (interaction.isModalSubmit()) {
			// Modal submits are handled inside handleButton flows which reply/update separately; nothing extra here.
			return;
		}
	} catch (err) {
		console.error('[configMenu] handler error:', err);
		if (interaction.isRepliable() && !interaction.replied) {
			try { await interaction.reply({ content: 'Error handling config interaction.', flags: 1<<6 }); } catch {}
		}
	}
});

// Legacy exports
const handleMessageCreate = handleConfigMenuCommand;

module.exports = { handleConfigMenuCommand, handleMessageCreate, renderSettingEmbed };
