const { EmbedBuilder, ActionRowBuilder } = require("discord.js");
const { isModerator } = require("./moderation/index");
const { OWNER_ID } = require("./moderation/permissions");
const ActiveMenus = require("../utils/activeMenus");
const theme = require("../utils/theme");
const { applyStandardFooter, semanticButton } = require("../ui");

const COMMAND_META = [
	{ cmd: '.help', cat: 'general', desc: 'Show this menu' },
	{ cmd: '.profile', cat: 'general', desc: 'Show your profile' },
	{ cmd: '.leaderboard', cat: 'general', desc: 'Show leaderboards' },
	{ cmd: '.cash', cat: 'general', desc: 'Wallet balance' },
	{ cmd: '.rank / .level', cat: 'level', desc: 'Show rank card' },
	{ cmd: '.profile vc', cat: 'level', desc: 'Show VC stats' },
	{ cmd: '.balance', cat: 'economy', desc: 'Bank & wallet UI' },
	{ cmd: '.deposit <amount>', cat: 'economy', desc: 'Deposit into bank' },
	{ cmd: '.withdraw <amount>', cat: 'economy', desc: 'Withdraw from bank' },
	{ cmd: '.metrics', cat: 'config', desc: 'Metrics dashboard', ownerOnly: true },
	{ cmd: '.config', cat: 'config', desc: 'Configuration menu', ownerOnly: true },
	{ cmd: '.test', cat: 'config', desc: 'Owner test utilities', ownerOnly: true },
	{ cmd: '.errors', cat: 'config', desc: 'List recent errors', ownerOnly: true },
	{ cmd: '.errdetail <index>', cat: 'config', desc: 'Error detail', ownerOnly: true },
	{ cmd: '.restart', cat: 'config', desc: 'Restart bot', ownerOnly: true },
	{ cmd: '.mute <@user> [time] [reason]', cat: 'moderation', modOnly: true, desc: 'Mute user' },
	{ cmd: '.unmute <@user>', cat: 'moderation', modOnly: true, desc: 'Remove mute' },
	{ cmd: '.timeout <@user> <time> [reason]', cat: 'moderation', modOnly: true, desc: 'Timeout user' },
	{ cmd: '.ban <@user> [reason]', cat: 'moderation', modOnly: true, desc: 'Ban user' },
	{ cmd: '.kick <@user> [reason]', cat: 'moderation', modOnly: true, desc: 'Kick user' },
	{ cmd: '.warn <@user> <reason>', cat: 'moderation', modOnly: true, desc: 'Warn user' },
	{ cmd: '.warnings [@user]', cat: 'moderation', modOnly: true, desc: 'List warnings' },
	{ cmd: '.removewarn <@user> <index>', cat: 'moderation', modOnly: true, desc: 'Remove warning' },
	{ cmd: '.purge <count> [@user|filters]', cat: 'moderation', modOnly: true, desc: 'Bulk delete' }
];

function buildHelpCategories(member) {
	const cats = {
		general: { id: 'general', label: 'General', emoji: '📚', commands: [] },
		level: { id: 'level', label: 'Leveling', emoji: '🧬', commands: [] },
		economy: { id: 'economy', label: 'Economy', emoji: '💰', commands: [] },
		moderation: { id: 'moderation', label: 'Moderation', emoji: '🛡️', modOnly: true, commands: [] },
		config: { id: 'config', label: 'Config', emoji: '🛠️', ownerOnly: true, commands: [] }
	};
	for (const meta of COMMAND_META) {
		if (meta.ownerOnly && String(member.id) !== String(OWNER_ID)) continue;
		if (meta.modOnly && !isModerator(member)) continue;
		if (!cats[meta.cat]) continue;
		cats[meta.cat].commands.push(`${meta.cmd} - ${meta.desc}`);
	}
	return Object.values(cats);
}

function filterCategories(member) { return buildHelpCategories(member); }

function buildCategoryEmbed(guild, member, categories, current) {
	const embed = new EmbedBuilder().setColor(theme.colors.primary || 0x5865F2);
	if (current === 'all') {
		embed.setTitle('Help — All Categories');
		embed.setDescription('Browse all commands. Use the buttons to filter categories.');
		for (const cat of categories) {
			embed.addFields({ name: `${cat.emoji||''} ${cat.label}`, value: cat.commands.map(c=>`• ${c}`).join('\n').slice(0,1024) });
		}
	} else {
		const cat = categories.find(c=>c.id===current) || categories[0];
		embed.setTitle(`Help — ${cat.label}`);
		embed.setDescription('Use buttons below to switch categories or view All.');
		const joined = cat.commands.map(c=>`• ${c}`).join('\n');
		embed.addFields({ name: `${cat.emoji||''} ${cat.label} Commands`, value: joined.slice(0,1024) || '*None*' });
	}
	applyStandardFooter(embed, guild, { testingMode: false });
	return embed;
}

function buildRows(categories, current) {
	const visible = [...categories];
	const rows = [];
	const firstCats = visible.slice(0,2);
	const firstRow = new ActionRowBuilder();
	firstRow.addComponents(
		semanticButton('nav', { id: 'helpv2:all', label: 'All', active: current==='all' })
	);
	for (const cat of firstCats) {
		firstRow.addComponents(
			semanticButton('nav', { id: `helpv2:${cat.id}`, label: cat.label, emoji: cat.emoji, active: cat.id===current })
		);
	}
	rows.push(firstRow);
	const remaining = visible.slice(2);
	for (let i=0;i<remaining.length;i+=3) {
		const row = new ActionRowBuilder();
		for (const cat of remaining.slice(i,i+3)) {
			row.addComponents(
				semanticButton('nav', { id: `helpv2:${cat.id}`, label: cat.label, emoji: cat.emoji, active: cat.id===current })
			);
		}
		rows.push(row);
		if (rows.length >= 5) break; // Discord limit
	}
	return rows;
}

async function handleHelpCommand(client, message) {
	const member = message.member; if (!member) return;
	const cats = filterCategories(member);
	const current = cats[0]?.id || 'general';
	const embed = buildCategoryEmbed(message.guild, member, cats, current);
	const rows = buildRows(cats, current);
	const sent = await message.reply({ embeds: [embed], components: rows, allowedMentions:{repliedUser:false} }).catch(()=>null);
	if (!sent) return;
	ActiveMenus.registerMessage(sent, { type: 'helpv2', userId: message.author.id, data: { current } });
}

ActiveMenus.registerHandler('helpv2', async (interaction, session) => {
	if (!interaction.isButton()) return;
	if (interaction.user.id !== session.userId) {
		return interaction.reply({ content: 'Not your session.', flags: 1<<6 }).catch(()=>{});
	}
	const member = interaction.guild?.members?.cache?.get(interaction.user.id) || interaction.member;
	const cats = filterCategories(member);
	const id = interaction.customId;
	let current = session.data.current;
	if (id === 'helpv2:all') current = 'all';
	else if (id.startsWith('helpv2:')) current = id.split(':')[1];
	const embed = buildCategoryEmbed(interaction.guild, member, cats, current);
	const rows = buildRows(cats, current);
	session.data.current = current;
	try { await interaction.update({ embeds:[embed], components: rows }); } catch {}
});

module.exports = { handleHelpCommand };
