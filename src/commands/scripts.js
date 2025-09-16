const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed } = require('../utils/embeds');
const theme = require('../utils/theme');
const { applyFooterWithPagination, paginationRow } = require('../ui');
const ActiveMenus = require('../utils/activeMenus');

// Recursively collect .js files excluding common non-source folders
function walkForJS(dir, baseDir, out = []) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		if (e.name.startsWith('.')) continue; // skip hidden
		if (e.isDirectory()) {
			const skip = ['node_modules', '.git', '.vscode', 'dist'].includes(e.name);
			if (skip) continue;
			walkForJS(path.join(dir, e.name), baseDir, out);
		} else if (e.isFile() && e.name.toLowerCase().endsWith('.js')) {
			const abs = path.join(dir, e.name);
			const rel = path.relative(baseDir, abs).replace(/\\/g, '/');
			try {
				const content = fs.readFileSync(abs, 'utf8');
				const lines = content.split(/\r?\n/).length;
				out.push({ file: rel, lines });
			} catch {}
		}
	}
	return out;
}

function chunk(arr, size) {
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

function buildEmbed(guild, pageItems, page, totalPages, totalFiles, totalLines) {
	const desc = pageItems
		.map(
			(it, idx) =>
				`**${page * 10 + idx + 1}.** ${it.file} — ${it.lines.toLocaleString()} line${it.lines === 1 ? '' : 's'}`,
		)
		.join('\n');
	const embed = createEmbed({
		title: '📝 Scripts Leaderboard',
		description: desc || '*No .js files found*',
		color: theme.colors.primary,
	});
	applyFooterWithPagination(embed, guild, {
		page: page + 1,
		totalPages,
		extra: `${totalFiles} files • ${totalLines.toLocaleString()} lines`,
	});
	return embed;
}

async function handleScriptsCommand(client, message) {
	const baseDir = path.resolve(__dirname, '..');
	const files = walkForJS(baseDir, baseDir).sort(
		(a, b) => b.lines - a.lines || a.file.localeCompare(b.file),
	);
	const totalFiles = files.length;
	const totalLines = files.reduce((s, f) => s + f.lines, 0);
	const pages = chunk(files, 10);
	const totalPages = Math.max(1, pages.length);
	const page = 1;
	const embed = buildEmbed(
		message.guild,
		pages[page - 1] || [],
		page - 1,
		totalPages,
		totalFiles,
		totalLines,
	);
	const row = paginationRow('scripts', page, totalPages);
	const close = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('scripts_close').setLabel('Close').setStyle(ButtonStyle.Danger),
	);
	const sent = await message
		.reply({ embeds: [embed], components: [row, close], allowedMentions: { repliedUser: false } })
		.catch(() => null);
	if (!sent) return;
	ActiveMenus.registerMessage(sent, {
		type: 'scripts',
		userId: message.author.id,
		data: { files, totalFiles, totalLines, page, totalPages },
	});
}

ActiveMenus.registerHandler('scripts', async (interaction, session) => {
	if (!interaction.isButton()) return;
	if (interaction.user.id !== session.userId) {
		try {
			await interaction.reply({ content: 'Not your session.', flags: 1 << 6 });
		} catch {}
		return;
	}
	if (interaction.customId === 'scripts_close') {
		try {
			const closed = createEmbed({
				title: 'Closed',
				description: 'This scripts leaderboard was closed.',
				color: theme.colors.danger,
			});
			await interaction.update({ embeds: [closed], components: [] });
		} catch {}
		return;
	}
	let { page, totalPages, files, totalFiles, totalLines } = session.data;
	if (interaction.customId === 'scripts_prev') page = Math.max(1, page - 1);
	else if (interaction.customId === 'scripts_next') page = Math.min(totalPages, page + 1);
	session.data.page = page;
	const pages = chunk(files, 10);
	const embed = buildEmbed(
		interaction.guild,
		pages[page - 1] || [],
		page - 1,
		totalPages,
		totalFiles,
		totalLines,
	);
	const row = paginationRow('scripts', page, totalPages);
	const close = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId('scripts_close').setLabel('Close').setStyle(ButtonStyle.Danger),
	);
	await interaction.update({ embeds: [embed], components: [row, close] }).catch(() => {});
});

module.exports = { handleScriptsCommand };
