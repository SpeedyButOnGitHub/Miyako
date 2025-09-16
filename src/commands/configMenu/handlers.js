const {
	PermissionFlagsBits,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
} = require('discord.js');
const { saveConfig, config, touchSettingMeta } = require('../../utils/storage');
const { logConfigChange } = require('../../utils/configLogs');
const { updateTestingStatus } = require('../../utils/testingBanner');
const {
	buildCategoryEmbed,
	buildSettingEmbed,
	buildSettingButtons,
	buildSettingSelect,
} = require('./render');

async function refreshSettingMessage(message, categoryName, settingName) {
	try {
		await message.edit({
			embeds: [buildSettingEmbed(categoryName, settingName)],
			components: [
				buildSettingSelect(categoryName),
				...buildSettingButtons(categoryName, settingName),
			],
		});
	} catch {}
}

async function openCategory(interaction, categoryName) {
	await interaction.update({
		embeds: [buildCategoryEmbed(categoryName)],
		components: [buildSettingSelect(categoryName)],
	});
}

async function openSetting(interaction, categoryName, settingName) {
	const { buildSettingRow } = require('./render');
	await interaction.update({
		embeds: [buildSettingEmbed(categoryName, settingName)],
		components: [buildSettingRow(categoryName, settingName)],
	});
}

// Minimal flows for a subset of buttons. More specialized flows can be added as needed.
async function handleButton(interaction, [categoryName, settingName, action]) {
	const ensureArray = (arr) => (Array.isArray(arr) ? arr : []);
	const parseId = (raw) => (raw || '').replace(/[^0-9]/g, '');

	// Economy > CashDrops
	if (categoryName === 'Economy' && settingName === 'CashDrops') {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			return interaction.reply({ content: 'Admin only.', flags: 1 << 6 });
		}
		const e = (config.cashDrops =
			typeof config.cashDrops === 'object' && config.cashDrops
				? config.cashDrops
				: { dropChance: 0.02, minAmount: 25, maxAmount: 125, lifetimeMs: 60000 });

		if (action === 'setChance') {
			const modalId = `config:modal:cashdrops:chance:${Date.now()}`;
			const modal = new ModalBuilder().setCustomId(modalId).setTitle('Set Drop Chance');
			const input = new TextInputBuilder()
				.setCustomId('chance')
				.setLabel('Chance per message (percent 0-100)')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(6)
				.setRequired(true);
			modal.addComponents(new ActionRowBuilder().addComponents(input));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const raw = submitted.fields.getTextInputValue('chance');
			const n = Number(raw);
			if (!Number.isFinite(n) || n < 0 || n > 100) {
				return submitted.reply({
					content: 'Enter a valid percent between 0 and 100.',
					flags: 1 << 6,
				});
			}
			const prev = e.dropChance;
			e.dropChance = Math.max(0, Math.min(1, n / 100));
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Set Cash Drop Chance`,
				before: prev,
				after: e.dropChance,
			});
			await submitted.reply({
				content: `Drop chance set to ${(e.dropChance * 100).toFixed(2)}% per message.`,
				flags: 1 << 6,
			});
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}

		if (action === 'setAmount') {
			const modalId = `config:modal:cashdrops:amount:${Date.now()}`;
			const modal = new ModalBuilder().setCustomId(modalId).setTitle('Set Drop Amount Range');
			const minInput = new TextInputBuilder()
				.setCustomId('min')
				.setLabel('Minimum amount')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(8)
				.setRequired(true);
			const maxInput = new TextInputBuilder()
				.setCustomId('max')
				.setLabel('Maximum amount')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(8)
				.setRequired(true);
			modal.addComponents(new ActionRowBuilder().addComponents(minInput));
			modal.addComponents(new ActionRowBuilder().addComponents(maxInput));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const min = Math.floor(Number(submitted.fields.getTextInputValue('min')));
			const max = Math.floor(Number(submitted.fields.getTextInputValue('max')));
			if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0 || max < min) {
				return submitted.reply({
					content: 'Enter valid non-negative integers (max >= min).',
					flags: 1 << 6,
				});
			}
			const beforeRange = { min: e.minAmount, max: e.maxAmount };
			e.minAmount = min;
			e.maxAmount = max;
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Set Cash Drop Amount Range`,
				before: beforeRange,
				after: { min, max },
			});
			await submitted.reply({ content: `Drop amount range set to ${min}-${max}.`, flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}

		if (action === 'setLifetime') {
			const modalId = `config:modal:cashdrops:lifetime:${Date.now()}`;
			const modal = new ModalBuilder().setCustomId(modalId).setTitle('Set Drop Lifetime');
			const input = new TextInputBuilder()
				.setCustomId('secs')
				.setLabel('Lifetime in seconds (>= 5)')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(8)
				.setRequired(true);
			modal.addComponents(new ActionRowBuilder().addComponents(input));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const s = Math.floor(Number(submitted.fields.getTextInputValue('secs')));
			if (!Number.isFinite(s) || s < 5 || s > 86400) {
				return submitted.reply({
					content: 'Enter a valid seconds value between 5 and 86400.',
					flags: 1 << 6,
				});
			}
			const prev = e.lifetimeMs;
			e.lifetimeMs = s * 1000;
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Set Cash Drop Lifetime`,
				before: prev,
				after: e.lifetimeMs,
			});
			await submitted.reply({ content: `Drop lifetime set to ${s}s.`, flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}

		return openSetting(interaction, categoryName, settingName);
	}

	// Simple numeric setter for GlobalXPMultiplier
	if (categoryName === 'Leveling' && settingName === 'GlobalXPMultiplier') {
		if (action === 'set') {
			const modalId = `config:modal:xpmult:${Date.now()}`;
			const modal = new ModalBuilder().setCustomId(modalId).setTitle('Set XP Multiplier');
			const input = new TextInputBuilder()
				.setCustomId('xpmult')
				.setLabel('Enter a number, e.g., 1, 1.5, 2')
				.setStyle(TextInputStyle.Short)
				.setMaxLength(8)
				.setRequired(true);
			modal.addComponents(new ActionRowBuilder().addComponents(input));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const v = submitted.fields.getTextInputValue('xpmult');
			const num = Number(v);
			if (!Number.isFinite(num) || num <= 0 || num > 100) {
				return submitted.reply({ content: 'Enter a valid number >0 and <=100.', flags: 1 << 6 });
			}
			const prev = config.globalXPMultiplier;
			config.globalXPMultiplier = num;
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Set Global XP Multiplier`,
				before: prev,
				after: num,
			});
			await submitted.reply({ content: `XP multiplier set to x${num.toFixed(2)}.`, flags: 1 << 6 });
			return;
		}
		if (action === 'reset') {
			const prev = config.globalXPMultiplier;
			config.globalXPMultiplier = 1;
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Reset Global XP Multiplier`,
				before: prev,
				after: 1,
			});
			return openSetting(interaction, categoryName, settingName);
		}
	}

	// Testing Mode toggle
	if (categoryName === 'Testing' && settingName === 'TestingMode') {
		if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
			return interaction.reply({ content: 'Admin only.', flags: 1 << 6 });
		}
		const prev = !!config.testingMode;
		if (action === 'enable') config.testingMode = true;
		else if (action === 'disable') config.testingMode = false;
		await saveConfig();
		if (prev !== config.testingMode) {
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Testing Mode ${config.testingMode ? 'enabled' : 'disabled'}`,
			});
			await updateTestingStatus(interaction.client, config.testingMode, interaction.user).catch(
				() => {},
			);
		}
		return openSetting(interaction, categoryName, settingName);
	}

	// Testing Warnings utilities
	if (categoryName === 'Testing' && settingName === 'TestingWarnings') {
		const { getOwnerId } = require('../moderation/permissions');
		if (String(interaction.user.id) !== String(getOwnerId() || '')) {
			// owner-only by environment guard; fall back to admin
			if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
				return interaction.reply({ content: 'Owner/Admin only.', flags: 1 << 6 });
			}
		}
		if (action === 'reseed') {
			const seed = config.testingSeed || {};
			config.testingWarnings = JSON.parse(JSON.stringify(seed));
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Reseeded testing warnings from seed (${Object.keys(seed).length} users).`,
			});
			await interaction.reply({ content: 'Reseeded testing warnings from seed.', flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
		if (action === 'clear') {
			config.testingWarnings = {};
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Cleared testing warnings.`,
			});
			await interaction.reply({ content: 'Cleared testing warnings.', flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
	}

	// Sniping Channel management via modal
	if (
		categoryName === 'Sniping' &&
		settingName === 'ChannelList' &&
		(action === 'addChannel' || action === 'removeChannel')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:sniping:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(action === 'addChannel' ? 'Add Channel' : 'Remove Channel');
		const input = new TextInputBuilder()
			.setCustomId('channel')
			.setLabel('Channel ID or mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(32);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('channel');
		const id = parseId(raw);
		const channel = interaction.guild.channels.cache.get(id);
		if (!channel) return submitted.reply({ content: 'Invalid or unknown channel.', flags: 1 << 6 });
		const mode = config.snipeMode === 'blacklist' ? 'blacklist' : 'whitelist';
		if (mode === 'whitelist') {
			config.snipingWhitelist = ensureArray(config.snipingWhitelist);
			if (action === 'addChannel') {
				if (!config.snipingWhitelist.includes(id)) config.snipingWhitelist.push(id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Added <#${id}> to sniping whitelist.`,
				});
				await submitted.reply({ content: `Added <#${id}> to whitelist.`, flags: 1 << 6 });
			} else {
				config.snipingWhitelist = config.snipingWhitelist.filter((x) => x !== id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed <#${id}> from sniping whitelist.`,
				});
				await submitted.reply({ content: `Removed <#${id}> from whitelist.`, flags: 1 << 6 });
			}
		} else {
			config.snipingChannelList = ensureArray(config.snipingChannelList);
			if (action === 'addChannel') {
				if (!config.snipingChannelList.includes(id)) config.snipingChannelList.push(id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Added <#${id}> to sniping blacklist.`,
				});
				await submitted.reply({ content: `Added <#${id}> to blacklist.`, flags: 1 << 6 });
			} else {
				config.snipingChannelList = config.snipingChannelList.filter((x) => x !== id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed <#${id}> from sniping blacklist.`,
				});
				await submitted.reply({ content: `Removed <#${id}> from blacklist.`, flags: 1 << 6 });
			}
		}
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Leveling Channel management via modal
	if (
		categoryName === 'Leveling' &&
		settingName === 'LevelingChannels' &&
		(action === 'addChannel' || action === 'removeChannel')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:leveling:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(action === 'addChannel' ? 'Add Leveling Channel' : 'Remove Leveling Channel');
		const input = new TextInputBuilder()
			.setCustomId('channel')
			.setLabel('Channel ID or mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(32);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('channel');
		const id = parseId(raw);
		const channel = interaction.guild.channels.cache.get(id);
		if (!channel) return submitted.reply({ content: 'Invalid or unknown channel.', flags: 1 << 6 });
		config.levelingChannelList = ensureArray(config.levelingChannelList);
		if (action === 'addChannel') {
			if (!config.levelingChannelList.includes(id)) config.levelingChannelList.push(id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Added <#${id}> to leveling channel list.`,
			});
			await submitted.reply({ content: `Added <#${id}>.`, flags: 1 << 6 });
		} else {
			config.levelingChannelList = config.levelingChannelList.filter((x) => x !== id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Removed <#${id}> from leveling channel list.`,
			});
			await submitted.reply({ content: `Removed <#${id}>.`, flags: 1 << 6 });
		}
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Moderation roles management
	if (
		categoryName === 'Moderation' &&
		settingName === 'ModeratorRoles' &&
		(action === 'addRole' || action === 'removeRole')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:modroles:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(action === 'addRole' ? 'Add Moderator Role' : 'Remove Moderator Role');
		const input = new TextInputBuilder()
			.setCustomId('role')
			.setLabel('Role ID or mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(32);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('role');
		const id = parseId(raw);
		const role = interaction.guild.roles.cache.get(id);
		if (!role) return submitted.reply({ content: 'Invalid or unknown role.', flags: 1 << 6 });
		config.moderatorRoles = ensureArray(config.moderatorRoles);
		if (action === 'addRole') {
			if (!config.moderatorRoles.includes(id)) config.moderatorRoles.push(id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Added <@&${id}> to moderatorRoles.`,
			});
			await submitted.reply({ content: `Added <@&${id}>.`, flags: 1 << 6 });
		} else {
			config.moderatorRoles = config.moderatorRoles.filter((x) => x !== id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Removed <@&${id}> from moderatorRoles.`,
			});
			await submitted.reply({ content: `Removed <@&${id}>.`, flags: 1 << 6 });
		}
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Autoroles management
	if (
		categoryName === 'Autoroles' &&
		settingName === 'AutoRoles' &&
		(action === 'addRole' || action === 'removeRole')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:autoroles:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(action === 'addRole' ? 'Add Autorole(s)' : 'Remove Autorole');
		const input = new TextInputBuilder()
			.setCustomId('roles')
			.setLabel(
				action === 'addRole'
					? 'Role IDs or mentions (comma-separated)'
					: 'Role numbers or IDs (comma-separated)',
			)
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(true)
			.setMaxLength(400);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('roles') || '';
		const items = raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		// addRole: accept role mentions or ids; allow multiple
		if (action === 'addRole') {
			const ids = items.map((s) => s.replace(/[^0-9]/g, '')).filter(Boolean);
			const valid = ids.filter((id) => !!interaction.guild.roles.cache.get(id));
			if (!valid.length)
				return submitted.reply({ content: 'No valid roles found in input.', flags: 1 << 6 });
			config.autoRoles = Array.isArray(config.autoRoles) ? config.autoRoles : [];
			for (const id of valid) if (!config.autoRoles.includes(id)) config.autoRoles.push(id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Added autoroles: ${valid.map((id) => `<@&${id}>`).join(', ')}`,
			});
			await submitted.reply({
				content: `Added autoroles: ${valid.map((id) => `<@&${id}>`).join(', ')}.`,
				flags: 1 << 6,
			});
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
		// removeRole: accept numeric indices (1-based) or role ids
		if (action === 'removeRole') {
			const arr = Array.isArray(config.autoRoles) ? config.autoRoles.slice() : [];
			const toRemove = new Set();
			for (const it of items) {
				const num = Number(it);
				if (Number.isInteger(num) && num >= 1 && num <= arr.length) {
					toRemove.add(arr[num - 1]);
					continue;
				}
				const id = it.replace(/[^0-9]/g, '');
				if (id && arr.includes(id)) toRemove.add(id);
			}
			if (!toRemove.size)
				return submitted.reply({
					content: 'No matching autoroles found to remove.',
					flags: 1 << 6,
				});
			config.autoRoles = arr.filter((id) => !toRemove.has(id));
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Removed autoroles: ${[...toRemove].map((id) => `<@&${id}>`).join(', ')}`,
			});
			await submitted.reply({ content: `Removed autoroles.`, flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
	}

	// Bot autorole edit (single value) -- accept invocations from either the AutoRoles row or the BotRole setting
	if (
		categoryName === 'Autoroles' &&
		(settingName === 'BotRole' || settingName === 'AutoRoles') &&
		action === 'botRole'
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:autoroles:bot:${Date.now()}`;
		const modal = new ModalBuilder().setCustomId(modalId).setTitle('Set Bot Autorole');
		const input = new TextInputBuilder()
			.setCustomId('role')
			.setLabel('Role ID or mention (leave blank to clear)')
			.setStyle(TextInputStyle.Short)
			.setRequired(false)
			.setMaxLength(64);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('role') || '';
		const id = (raw || '').replace(/[^0-9]/g, '');
		if (id) {
			const role = interaction.guild.roles.cache.get(id);
			if (!role) return submitted.reply({ content: 'Invalid or unknown role.', flags: 1 << 6 });
			config.autoRolesBot = id;
			await saveConfig();
			touchSettingMeta(`${categoryName}.BotRole`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Set bot autorole to <@&${id}>`,
			});
			await submitted.reply({ content: `Bot autorole set to <@&${id}>.`, flags: 1 << 6 });
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
		// clearing
		const prev = config.autoRolesBot;
		delete config.autoRolesBot;
		await saveConfig();
		touchSettingMeta(`${categoryName}.BotRole`);
		await logConfigChange(interaction.client, {
			user: interaction.user,
			change: `Cleared bot autorole (was ${prev || 'none'})`,
		});
		await submitted.reply({ content: 'Cleared bot autorole.', flags: 1 << 6 });
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Role Log Blacklist management
	if (
		categoryName === 'Moderation' &&
		settingName === 'RoleLogBlacklist' &&
		(action === 'addBlacklistRole' || action === 'removeBlacklistRole')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:rolelog:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(
				action === 'addBlacklistRole' ? 'Add Role to Blacklist' : 'Remove Role from Blacklist',
			);
		const input = new TextInputBuilder()
			.setCustomId('role')
			.setLabel('Role ID or mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(32);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('role');
		const id = parseId(raw);
		const role = interaction.guild.roles.cache.get(id);
		if (!role) return submitted.reply({ content: 'Invalid or unknown role.', flags: 1 << 6 });
		config.roleLogBlacklist = ensureArray(config.roleLogBlacklist);
		if (action === 'addBlacklistRole') {
			if (!config.roleLogBlacklist.includes(id)) config.roleLogBlacklist.push(id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Blacklisted <@&${id}> from role logs.`,
			});
			await submitted.reply({ content: `Blacklisted <@&${id}> from role logs.`, flags: 1 << 6 });
		} else {
			config.roleLogBlacklist = config.roleLogBlacklist.filter((x) => x !== id);
			await saveConfig();
			touchSettingMeta(`${categoryName}.${settingName}`);
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Removed <@&${id}> from role log blacklist.`,
			});
			await submitted.reply({
				content: `Removed <@&${id}> from role log blacklist.`,
				flags: 1 << 6,
			});
		}
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Leveling Role XP Blacklist management
	if (
		categoryName === 'Leveling' &&
		settingName === 'RoleXPBlacklist' &&
		(action === 'addRole' || action === 'removeRole')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const modalId = `config:modal:rolexp:${action}:${Date.now()}`;
		const modal = new ModalBuilder()
			.setCustomId(modalId)
			.setTitle(action === 'addRole' ? 'Add Blocked Role' : 'Remove Blocked Role');
		const input = new TextInputBuilder()
			.setCustomId('role')
			.setLabel('Role ID or mention')
			.setStyle(TextInputStyle.Short)
			.setRequired(true)
			.setMaxLength(32);
		modal.addComponents(new ActionRowBuilder().addComponents(input));
		await interaction.showModal(modal);
		const submitted = await interaction
			.awaitModalSubmit({
				time: 30000,
				filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
			})
			.catch(() => null);
		if (!submitted) return;
		const raw = submitted.fields.getTextInputValue('role');
		const id = parseId(raw);
		const role = interaction.guild.roles.cache.get(id);
		if (!role) return submitted.reply({ content: 'Invalid or unknown role.', flags: 1 << 6 });
		config.roleXPBlacklist = ensureArray(config.roleXPBlacklist);
		if (action === 'addRole') {
			if (!config.roleXPBlacklist.includes(id)) config.roleXPBlacklist.push(id);
			await saveConfig();
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Added <@&${id}> to XP blacklist.`,
			});
			await submitted.reply({ content: `Added <@&${id}> to XP blacklist.`, flags: 1 << 6 });
		} else {
			config.roleXPBlacklist = config.roleXPBlacklist.filter((x) => x !== id);
			await saveConfig();
			await logConfigChange(interaction.client, {
				user: interaction.user,
				change: `Removed <@&${id}> from XP blacklist.`,
			});
			await submitted.reply({ content: `Removed <@&${id}> from XP blacklist.`, flags: 1 << 6 });
		}
		await refreshSettingMessage(interaction.message, categoryName, settingName);
		return;
	}

	// Level Rewards management
	if (
		categoryName === 'Leveling' &&
		settingName === 'LevelRewards' &&
		(action === 'addLevel' ||
			action === 'removeLevel' ||
			action === 'addReward' ||
			action === 'removeReward')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const parseRolesCsv = (txt) =>
			(txt || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.map((s) => s.replace(/[^0-9]/g, ''))
				.filter(Boolean);
		const ensureLevelArr = (lvl) => {
			if (typeof config.levelRewards !== 'object' || !config.levelRewards) config.levelRewards = {};
			if (!Array.isArray(config.levelRewards[lvl])) config.levelRewards[lvl] = [];
			return config.levelRewards[lvl];
		};

		if (action === 'addLevel' || action === 'removeLevel') {
			const modalId = `config:modal:levelrewards:${action}:${Date.now()}`;
			const modal = new ModalBuilder()
				.setCustomId(modalId)
				.setTitle(action === 'addLevel' ? 'Add Level' : 'Remove Level');
			const levelInput = new TextInputBuilder()
				.setCustomId('level')
				.setLabel('Level (number)')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(6);
			modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const levelStr = submitted.fields.getTextInputValue('level');
			const lvlNum = Number(levelStr);
			if (!Number.isInteger(lvlNum) || lvlNum < 0 || lvlNum > 10000) {
				return submitted.reply({
					content: 'Enter a valid non-negative integer level (<= 10000).',
					flags: 1 << 6,
				});
			}
			if (action === 'addLevel') {
				ensureLevelArr(String(lvlNum));
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Created Level ${lvlNum} in levelRewards.`,
				});
				await submitted.reply({ content: `Created level ${lvlNum}.`, flags: 1 << 6 });
			} else {
				if (config.levelRewards && config.levelRewards[String(lvlNum)])
					delete config.levelRewards[String(lvlNum)];
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed Level ${lvlNum} from levelRewards.`,
				});
				await submitted.reply({ content: `Removed level ${lvlNum}.`, flags: 1 << 6 });
			}
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}

		if (action === 'addReward' || action === 'removeReward') {
			const modalId = `config:modal:levelrewards:${action}:${Date.now()}`;
			const modal = new ModalBuilder()
				.setCustomId(modalId)
				.setTitle(action === 'addReward' ? 'Add Rewards' : 'Remove Rewards');
			const levelInput = new TextInputBuilder()
				.setCustomId('level')
				.setLabel('Level (number)')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(6);
			const rolesInput = new TextInputBuilder()
				.setCustomId('roles')
				.setLabel('Role IDs or mentions (comma-separated)')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setMaxLength(400);
			modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
			modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const levelStr = submitted.fields.getTextInputValue('level');
			const rolesStr = submitted.fields.getTextInputValue('roles');
			const lvlNum = Number(levelStr);
			if (!Number.isInteger(lvlNum) || lvlNum < 0 || lvlNum > 10000) {
				return submitted.reply({
					content: 'Enter a valid non-negative integer level (<= 10000).',
					flags: 1 << 6,
				});
			}
			const ids = parseRolesCsv(rolesStr);
			if (!ids.length)
				return submitted.reply({ content: 'Provide at least one role.', flags: 1 << 6 });
			const validIds = ids.filter((id) => !!interaction.guild.roles.cache.get(id));
			if (!validIds.length)
				return submitted.reply({ content: 'No valid roles found in input.', flags: 1 << 6 });

			const key = String(lvlNum);
			const arr = ensureLevelArr(key);
			if (action === 'addReward') {
				for (const id of validIds) if (!arr.includes(id)) arr.push(id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Added ${validIds.map((id) => `<@&${id}>`).join(', ')} to Level ${lvlNum}.`,
				});
				await submitted.reply({
					content: `Added ${validIds.map((id) => `<@&${id}>`).join(', ')} to level ${lvlNum}.`,
					flags: 1 << 6,
				});
			} else {
				const before = arr.length;
				const set = new Set(validIds);
				config.levelRewards[key] = arr.filter((id) => !set.has(id));
				const after = config.levelRewards[key].length;
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed ${before - after} role(s) from Level ${lvlNum}.`,
				});
				await submitted.reply({
					content: `Removed ${before - after} role(s) from level ${lvlNum}.`,
					flags: 1 << 6,
				});
			}
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
	}

	// VC Level Rewards management
	if (
		categoryName === 'Leveling' &&
		settingName === 'VCLevelRewards' &&
		(action === 'addLevel' ||
			action === 'removeLevel' ||
			action === 'addReward' ||
			action === 'removeReward')
	) {
		if (!interaction.guild) return interaction.reply({ content: 'Guild only.', flags: 1 << 6 });
		const parseRolesCsv = (txt) =>
			(txt || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
				.map((s) => s.replace(/[^0-9]/g, ''))
				.filter(Boolean);
		const ensureLevelArr = (lvl) => {
			if (typeof config.vcLevelRewards !== 'object' || !config.vcLevelRewards)
				config.vcLevelRewards = {};
			if (!Array.isArray(config.vcLevelRewards[lvl])) config.vcLevelRewards[lvl] = [];
			return config.vcLevelRewards[lvl];
		};

		if (action === 'addLevel' || action === 'removeLevel') {
			const modalId = `config:modal:vclevelrewards:${action}:${Date.now()}`;
			const modal = new ModalBuilder()
				.setCustomId(modalId)
				.setTitle(action === 'addLevel' ? 'Add VC Level' : 'Remove VC Level');
			const levelInput = new TextInputBuilder()
				.setCustomId('level')
				.setLabel('Level (number)')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(6);
			modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const levelStr = submitted.fields.getTextInputValue('level');
			const lvlNum = Number(levelStr);
			if (!Number.isInteger(lvlNum) || lvlNum < 0 || lvlNum > 10000) {
				return submitted.reply({
					content: 'Enter a valid non-negative integer level (<= 10000).',
					flags: 1 << 6,
				});
			}
			if (action === 'addLevel') {
				ensureLevelArr(String(lvlNum));
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Created VC Level ${lvlNum} in vcLevelRewards.`,
				});
				await submitted.reply({ content: `Created VC level ${lvlNum}.`, flags: 1 << 6 });
			} else {
				if (config.vcLevelRewards && config.vcLevelRewards[String(lvlNum)])
					delete config.vcLevelRewards[String(lvlNum)];
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed VC Level ${lvlNum} from vcLevelRewards.`,
				});
				await submitted.reply({ content: `Removed VC level ${lvlNum}.`, flags: 1 << 6 });
			}
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}

		if (action === 'addReward' || action === 'removeReward') {
			const modalId = `config:modal:vclevelrewards:${action}:${Date.now()}`;
			const modal = new ModalBuilder()
				.setCustomId(modalId)
				.setTitle(action === 'addReward' ? 'Add VC Rewards' : 'Remove VC Rewards');
			const levelInput = new TextInputBuilder()
				.setCustomId('level')
				.setLabel('Level (number)')
				.setStyle(TextInputStyle.Short)
				.setRequired(true)
				.setMaxLength(6);
			const rolesInput = new TextInputBuilder()
				.setCustomId('roles')
				.setLabel('Role IDs or mentions (comma-separated)')
				.setStyle(TextInputStyle.Paragraph)
				.setRequired(true)
				.setMaxLength(400);
			modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
			modal.addComponents(new ActionRowBuilder().addComponents(rolesInput));
			await interaction.showModal(modal);
			const submitted = await interaction
				.awaitModalSubmit({
					time: 30000,
					filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
				})
				.catch(() => null);
			if (!submitted) return;
			const levelStr = submitted.fields.getTextInputValue('level');
			const rolesStr = submitted.fields.getTextInputValue('roles');
			const lvlNum = Number(levelStr);
			if (!Number.isInteger(lvlNum) || lvlNum < 0 || lvlNum > 10000) {
				return submitted.reply({
					content: 'Enter a valid non-negative integer level (<= 10000).',
					flags: 1 << 6,
				});
			}
			const ids = parseRolesCsv(rolesStr);
			if (!ids.length)
				return submitted.reply({ content: 'Provide at least one role.', flags: 1 << 6 });
			const validIds = ids.filter((id) => !!interaction.guild.roles.cache.get(id));
			if (!validIds.length)
				return submitted.reply({ content: 'No valid roles found in input.', flags: 1 << 6 });

			const key = String(lvlNum);
			const arr = ensureLevelArr(key);
			if (action === 'addReward') {
				for (const id of validIds) if (!arr.includes(id)) arr.push(id);
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Added ${validIds.map((id) => `<@&${id}>`).join(', ')} to VC Level ${lvlNum}.`,
				});
				await submitted.reply({
					content: `Added ${validIds.map((id) => `<@&${id}>`).join(', ')} to VC level ${lvlNum}.`,
					flags: 1 << 6,
				});
			} else {
				const before = arr.length;
				const set = new Set(validIds);
				config.vcLevelRewards[key] = arr.filter((id) => !set.has(id));
				const after = config.vcLevelRewards[key].length;
				await saveConfig();
				await logConfigChange(interaction.client, {
					user: interaction.user,
					change: `Removed ${before - after} role(s) from VC Level ${lvlNum}.`,
				});
				await submitted.reply({
					content: `Removed ${before - after} role(s) from VC level ${lvlNum}.`,
					flags: 1 << 6,
				});
			}
			await refreshSettingMessage(interaction.message, categoryName, settingName);
			return;
		}
	}

	return interaction.reply({
		content: 'This action is not implemented yet in the modular UI.',
		flags: 1 << 6,
	});
}

// No-op for now; kept for future modal routes if needed from elsewhere
async function handleModal() {
	return;
}

module.exports = { openCategory, openSetting, handleButton, handleModal };
