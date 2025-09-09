const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { isModerator } = require("./moderation/index");
const { OWNER_ID } = require("./moderation/permissions");
const ActiveMenus = require("../utils/activeMenus");
const theme = require("../utils/theme");
const { applyStandardFooter, semanticButton } = require("../utils/ui");

// Categorized help with interactive buttons (compact mode removed per request).
const HELP_CATEGORIES = [
  { id: 'general', label: 'General', emoji: '📌', commands: [
    '.help - show this menu',
    '.profile - show your profile',
    '.leaderboard - show leaderboard(s)',
    '.cash - show wallet balance'
  ]},
  { id: 'level', label: 'Leveling', emoji: '🧬', commands: [
    '.rank / .level - show rank card',
    '.leaderboard - text leveling leaderboard',
    '.profile vc - show VC stats'
  ]},
  { id: 'economy', label: 'Economy', emoji: '💰', commands: [
    '.balance - open bank & wallet UI',
    '.deposit <amount> - deposit into bank',
    '.withdraw <amount> - withdraw from bank'
  ]},
  { id: 'moderation', label: 'Moderation', emoji: '🛡️', modOnly: true, commands: [
    '.mute <@user> [time] [reason]',
    '.unmute <@user>',
    '.timeout <@user> <time> [reason]',
    '.ban <@user> [reason]',
    '.kick <@user> [reason]',
    '.warn <@user> <reason>',
    '.warnings [@user]',
    '.removewarn <@user> <index>',
    '.purge <count> [@user|filters]' 
  ]},
  { id: 'config', label: 'Config', emoji: '🛠️', ownerOnly: true, commands: [
    '.config - open configuration menu',
    '.test - owner test utilities',
    '.errors - list recent errors',
    '.errdetail <index> - full error detail',
    '.restart - restart bot'
  ]}
];

function filterCategories(member) {
  return HELP_CATEGORIES.filter(cat => {
    if (cat.ownerOnly && String(member.id) !== String(OWNER_ID)) return false;
    if (cat.modOnly && !isModerator(member)) return false;
    return true;
  });
}

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
  // Custom layout for narrower look: first row includes 'All' + up to 2 categories, rest distributed 3 per row.
  const visible = [...categories];
  const rows = [];
  const firstCats = visible.slice(0,2);
  const firstRow = new ActionRowBuilder();
  // All button
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
  const msg = await message.reply({ embeds: [embed], components: rows, allowedMentions:{repliedUser:false} }).catch(()=>null);
  if (!msg) return;
  ActiveMenus.registerMessage(msg, { type: 'helpv2', userId: message.author.id, data: { current } });
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
