const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { isModerator } = require("./moderation/index");
const { OWNER_ID } = require("./moderation/permissions");
const ActiveMenus = require("../utils/activeMenus");
const theme = require("../utils/theme");
const { applyStandardFooter } = require("../utils/ui");

// Redesigned categorized help with interactive category buttons.
// Add / edit categories here.
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
  const embed = new EmbedBuilder()
    .setColor(theme.colors.primary || 0x5865F2);
  if (current === 'all') {
    embed.setTitle('Help — All Categories');
    embed.setDescription('Browse all commands below. Use the buttons to filter by category.');
    for (const cat of categories) {
      embed.addFields({ name: `${cat.emoji||''} ${cat.label}`, value: cat.commands.map(c=>`• ${c}`).join('\n').slice(0,1024) });
    }
  } else {
    const cat = categories.find(c=>c.id===current) || categories[0];
    embed.setTitle(`Help — ${cat.label}`);
    embed.setDescription('Use buttons to switch categories or view all.');
    // Split if needed
    const joined = cat.commands.map(c=>`• ${c}`).join('\n');
    embed.addFields({ name: `${cat.emoji||''} ${cat.label} Commands`, value: joined.slice(0, 1024) || '*None*' });
  }
  applyStandardFooter(embed, guild, { testingMode: false });
  return embed;
}

function buildRows(categories, current) {
  // Up to first 5 category buttons (fits typical set). If more, second row handles remainder.
  const catButtons = categories.map(cat => new ButtonBuilder()
    .setCustomId(`helpv2:${cat.id}`)
    .setLabel(cat.label)
    .setStyle(cat.id === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
    .setEmoji(cat.emoji || undefined)
    .setDisabled(cat.id === current)
  );
  const rows = [];
  // Split into rows of up to 5
  for (let i=0;i<catButtons.length;i+=5) {
    rows.push(new ActionRowBuilder().addComponents(catButtons.slice(i, i+5)));
  }
  // Control row
  const controls = new ActionRowBuilder();
  controls.addComponents(
    new ButtonBuilder().setCustomId('helpv2:all').setLabel('All').setStyle(current==='all'?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(current==='all'),
    new ButtonBuilder().setCustomId('helpv2:close').setLabel('Close').setStyle(ButtonStyle.Danger)
  );
  rows.push(controls);
  return rows.slice(0,5); // safety (max 5 rows in Discord)
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
    return interaction.reply({ content: 'Not your session.', ephemeral: true }).catch(()=>{});
  }
  const member = interaction.guild?.members?.cache?.get(interaction.user.id) || interaction.member;
  const cats = filterCategories(member);
  const id = interaction.customId;
  if (id === 'helpv2:close') {
    try { await interaction.update({ components: [], embeds: interaction.message.embeds }); } catch {}
    return;
  }
  let current = session.data.current;
  if (id === 'helpv2:all') current = 'all';
  else if (id.startsWith('helpv2:')) current = id.split(':')[1];
  const embed = buildCategoryEmbed(interaction.guild, member, cats, current);
  const rows = buildRows(cats, current);
  session.data.current = current;
  try { await interaction.update({ embeds:[embed], components: rows }); } catch {}
});

module.exports = { handleHelpCommand };
