const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { isModerator } = require("./moderation/index");
const { OWNER_ID } = require("./moderation/permissions");
const ActiveMenus = require("../utils/activeMenus");
const theme = require("../utils/theme");
const { applyStandardFooter, paginationRow } = require("../utils/ui");

// Simple categorized help. We keep static for now; could be dynamic later.
const HELP_CATEGORIES = [
  {
    id: 'general',
    label: 'General',
    commands: [
      '.help - show this menu',
      '.profile - show your profile',
      '.leaderboard - show leaderboard',
      '.cash - show wallet balance'
    ]
  },
  {
    id: 'level',
    label: 'Leveling',
    commands: [
      '.rank / .level - show rank card',
      '.leaderboard - text leveling leaderboard',
      '.profile vc - show VC stats'
    ]
  },
  {
    id: 'economy',
    label: 'Economy',
    commands: [
      '.balance - open bank & wallet UI',
      '.deposit <amount> - deposit into bank',
      '.withdraw <amount> - withdraw from bank'
    ]
  },
  {
    id: 'moderation',
    label: 'Moderation',
    modOnly: true,
    commands: [
      '.mute <@user> [time] [reason]',
      '.unmute <@user>',
      '.timeout <@user> <time> [reason]',
      '.ban <@user> [reason]',
      '.kick <@user> [reason]',
      '.warn <@user> <reason>',
      '.warnings [@user]',
      '.removewarn <@user> <index>'
    ]
  },
  {
    id: 'config',
    label: 'Config',
    ownerOnly: true,
    commands: [
      '.config - open configuration menu',
      '.test - owner test utilities'
    ]
  }
];

function visibleCategories(member) {
  return HELP_CATEGORIES.filter(cat => {
    if (cat.ownerOnly) return String(member.id) === String(OWNER_ID);
    if (cat.modOnly) return isModerator(member);
    return true;
  });
}

function buildHelpEmbed(guild, cats, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(cats.length / pageSize));
  page = Math.min(totalPages, Math.max(1, page));
  const slice = cats.slice((page - 1) * pageSize, page * pageSize);
  const embed = new EmbedBuilder()
    .setTitle('Help')
    .setColor(theme.colors.primary || 0x5865F2)
    .setDescription('Command reference. Use the buttons below to switch pages.');
  for (const cat of slice) {
    embed.addFields({ name: cat.label, value: cat.commands.map(c => `• ${c}`).join('\n') || '*None*' });
  }
  applyStandardFooter(embed, guild, { testingMode: false });
  return { embed, totalPages, page };
}

async function handleHelpCommand(client, message) {
  const member = message.member;
  if (!member) return;
  const cats = visibleCategories(member);
  const PAGE_SIZE = 2;
  const page = 1;
  const { embed, totalPages } = buildHelpEmbed(message.guild, cats, page, PAGE_SIZE);
  const row = paginationRow(`help_${page}`, page, totalPages);
  const msg = await message.reply({ embeds: [embed], components: [row] }).catch(() => null);
  if (!msg) return;
  ActiveMenus.registerMessage(msg, {
    type: 'help',
    userId: message.author.id,
    page,
    totalPages,
    pageSize: PAGE_SIZE,
  });
}

ActiveMenus.registerHandler('help', async (interaction, session) => {
  const member = interaction.guild?.members?.cache?.get(interaction.user.id) || interaction.member;
  const cats = visibleCategories(member);
  if (!interaction.isButton()) return;
  const m = interaction.customId.match(/^help_(\d+)_(prev|next|page)$/);
  if (!m) return;
  let cur = Number(m[1]) || 1;
  const action = m[2];
  const totalPages = Math.max(1, Math.ceil(cats.length / session.pageSize));
  if (action === 'prev') cur = Math.max(1, cur - 1);
  else if (action === 'next') cur = Math.min(totalPages, cur + 1);
  const { embed } = buildHelpEmbed(interaction.guild, cats, cur, session.pageSize);
  const row = paginationRow(`help_${cur}`, cur, totalPages);
  session.page = cur;
  session.totalPages = totalPages;
  await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
});

module.exports = { handleHelpCommand };
