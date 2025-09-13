const { createEmbed } = require('../utils/embeds');
const theme = require('../utils/theme');
const { config, saveConfig } = require('../utils/storage');
const { updateTestingStatus } = require('../utils/testingBanner');
const { TEST_LOG_CHANNEL } = require('../utils/logChannels');
const { spawnTestDrop } = require('../utils/cashDrops');
const { addTestingCash, clearTestingCash } = require('../utils/cash');
const levels = require('../utils/levels');
const vcLevels = require('../utils/vcLevels');

function idFromMentionOrArg(arg, message) {
	if (!arg) return null;
	const mention = message.mentions?.users?.first?.();
	if (mention) return mention.id;
	const m = String(arg).match(/^(?:<@!?)?(\d{5,})(?:>)?$/);
	return m ? m[1] : null;
}

async function replyInfo(message, lines) {
	const embed = createEmbed({ title: `${theme.emojis.info} Test Utilities`, description: Array.isArray(lines) ? lines.join('\n') : String(lines), color: theme.colors.primary });
	return message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
}

async function handleModeSubcommand(client, message, args) {
	const action = (args[1] || '').toLowerCase();
	let next = config.testingMode;
	if (action === 'on' || action === 'enable') next = true;
	else if (action === 'off' || action === 'disable') next = false;
	else if (action === 'toggle' || action === '') next = !config.testingMode;
	else return replyInfo(message, [
		'Usage:',
		'• .test mode on | off | toggle'
	]);
	config.testingMode = !!next; saveConfig();
	try { await updateTestingStatus(client, config.testingMode, message.author); } catch {}
	return replyInfo(message, `Testing Mode is now ${config.testingMode ? 'ON' : 'OFF'}.`);
}

async function handleStatusSubcommand(client, message) {
	const lines = [
		`Mode: ${config.testingMode ? '`ON`' : '`OFF`'}`,
		`Sniping Mode: ${config.snipeMode || 'whitelist'}`,
		`Leveling Mode: ${config.levelingMode || 'blacklist'}`
	];
	return replyInfo(message, lines);
}

async function handleDropSubcommand(client, message, args) {
	const amtArg = Number(args[1]);
	const amount = Number.isFinite(amtArg) && amtArg > 0 ? Math.floor(amtArg) : null;
	const drop = spawnTestDrop(amount || undefined);
	// Announce in the test log channel so users can claim it there
	const channel = await client.channels.fetch(TEST_LOG_CHANNEL).catch(() => null);
	if (channel && channel.send) {
		const { EmbedBuilder } = require('discord.js');
		const embed = new EmbedBuilder()
			.setTitle('💸 Test Cash Drop')
			.setColor(theme.colors.warning)
			.setDescription(`Type this word in this channel to claim first:\n\n→ \`${drop.word}\``)
			.addFields(
				{ name: 'Reward', value: `**$${drop.amount.toLocaleString()}**`, inline: true },
				{ name: 'Lifetime', value: `~${Math.round((drop.expiresAt - Date.now())/1000)}s`, inline: true }
			);
		try { await channel.send({ embeds: [embed] }); } catch {}
	}
	const jump = channel ? `https://discord.com/channels/${message.guildId}/${channel.id}` : null;
	return replyInfo(message, [
		`Spawned a test drop for $${drop.amount.toLocaleString()} in the test channel.`,
		jump ? `Go claim it here → ${jump}` : ''
	].filter(Boolean));
}

async function handleCashSubcommand(client, message, args) {
	const action = (args[1] || '').toLowerCase();
	if (action === 'add') {
		const uid = idFromMentionOrArg(args[2], message) || message.author.id;
		const amount = Math.max(0, Math.floor(Number(args[3]) || 0));
		if (!amount) return replyInfo(message, 'Usage: .test cash add <@user|id> <amount>');
		const next = addTestingCash(uid, amount);
		return replyInfo(message, `Added $${amount.toLocaleString()} (testing) to <@${uid}>. New test cash: $${next.toLocaleString()}.`);
	}
	if (action === 'clear') {
		const scope = (args[2] || '').toLowerCase();
		// Only a global clear is supported for now (simple and safe)
		clearTestingCash();
		return replyInfo(message, 'Cleared testing cash overlay for all users.');
	}
	return replyInfo(message, [
		'Usage:',
		'• .test cash add <@user|id> <amount>',
		'• .test cash clear'
	]);
}

async function handleXPSubcommand(client, message, args) {
	const action = (args[1] || '').toLowerCase();
	const isVC = args.some(a => String(a).toLowerCase() === 'vc');
	if (action === 'add') {
		const uid = idFromMentionOrArg(args[2], message) || message.author.id;
		const amount = Math.max(0, Math.floor(Number(args[3]) || 0));
		if (!amount) return replyInfo(message, 'Usage: .test xp add <@user|id> <amount> [vc]');
		let leveled = 0;
		try {
			leveled = isVC ? vcLevels.addVCXP(uid, amount) : levels.addXP(uid, amount);
		} catch {}
		return replyInfo(message, `Granted ${amount} ${isVC ? 'VC ' : ''}XP to <@${uid}>.${leveled ? ` New level: ${isVC ? vcLevels.getVCLevel(uid) : levels.getLevel(uid)}.` : ''}`);
	}
	if (action === 'reset') {
		const target = (args[2] || '').toLowerCase();
		if (target === 'all') {
			if (isVC) {
				// Reset all VC levels
				for (const uid of Object.keys(vcLevels.vcLevels)) vcLevels.vcLevels[uid] = { xp: 0, level: 0 };
				vcLevels.saveVCLevels();
			} else {
				for (const uid of Object.keys(levels.levels)) levels.levels[uid] = { xp: 0, level: 0 };
				levels.saveLevels();
			}
			return replyInfo(message, `Reset ${isVC ? 'VC ' : ''}XP for all users.`);
		}
		const uid = idFromMentionOrArg(args[2], message) || message.author.id;
		if (isVC) { vcLevels.vcLevels[uid] = { xp: 0, level: 0 }; vcLevels.saveVCLevels(); }
		else { levels.levels[uid] = { xp: 0, level: 0 }; levels.saveLevels(); }
		return replyInfo(message, `Reset ${isVC ? 'VC ' : ''}XP for <@${uid}>.`);
	}
	return replyInfo(message, [
		'Usage:',
		'• .test xp add <@user|id> <amount> [vc]',
		'• .test xp reset <@user|id|all> [vc]'
	]);
}

async function handleTestCommand(client, message) {
	const parts = message.content.slice(1).trim().split(/\s+/);
	// parts[0] === 'test'
	const sub = (parts[1] || '').toLowerCase();
	const args = parts; // keep original for positional indexes used above
	try {
		if (!sub || sub === 'help') {
			return replyInfo(message, [
				'**.test owner utilities**',
				'• .test mode on|off|toggle',
				'• .test status',
				'• .test drop [amount]',
				'• .test cash add <@user|id> <amount>',
				'• .test cash clear',
				'• .test xp add <@user|id> <amount> [vc]',
				'• .test xp reset <@user|id|all> [vc]'
			]);
		}
		if (sub === 'mode') return handleModeSubcommand(client, message, args);
		if (sub === 'status') return handleStatusSubcommand(client, message);
		if (sub === 'drop') return handleDropSubcommand(client, message, args);
		if (sub === 'cash') return handleCashSubcommand(client, message, args);
		if (sub === 'xp') return handleXPSubcommand(client, message, args);
		return replyInfo(message, 'Unknown .test subcommand. Try `.test` for help.');
	} catch (e) {
		throw e;
	}
}

module.exports = { handleTestCommand };

// Jest placeholder so this file doesn't fail when picked as a test by name
// Some Jest setups match files named "test.js" even with custom testMatch.
if (process.env.JEST_WORKER_ID !== undefined) {
	describe('commands/test.js smoke', () => {
		it('exports handleTestCommand', () => {
			expect(typeof handleTestCommand).toBe('function');
		});
	});
}
