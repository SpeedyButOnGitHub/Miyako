const ActiveMenus = require("../utils/activeMenus");
const { levels } = require("../utils/levels");
const { vcLevels } = require("../utils/vcLevels");
const { buildLeaderboardEmbed } = require("../utils/leaderboards");
const { paginationRow } = require("../utils/ui");

async function handleLeaderboardCommand(client, message) {
  const guild = message.guild;
  if (!guild) return;
  const member = message.member;
  if (!member) return;
  const mode = "text";
  const page = 1;
  const source = mode === "vc" ? vcLevels : levels;
  const embed = buildLeaderboardEmbed(guild, source, member.id, page, 10, mode);
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  function rows(m, p, total) {
    const toggle = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lb_toggle_mode").setLabel(m === "text" ? "🎙️ VC Mode" : "💬 Text Mode").setStyle(ButtonStyle.Secondary)
    );
    return [toggle, paginationRow("lb", p, total)];
  }
  const totalPages = Math.max(1, Math.ceil(Object.keys(source || {}).length / 10));
  const sent = await message.reply({ embeds: [embed], components: rows(mode, page, totalPages) }).catch(() => null);
  if (sent) {
    ActiveMenus.registerMessage(sent, { type: "leaderboard", userId: member.id, data: { mode, page } });
  }
}

ActiveMenus.registerHandler("leaderboard", async (interaction, session) => {
  const member = interaction.member;
  if (!member || member.id !== session.userId) {
    try { await interaction.reply({ content: "Only the original user can use this leaderboard.", ephemeral: true }); } catch {}
    return;
  }
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  function rows(m, p, total) {
    const toggle = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("lb_toggle_mode").setLabel(m === "text" ? "🎙️ VC Mode" : "💬 Text Mode").setStyle(ButtonStyle.Secondary)
    );
    return [toggle, paginationRow("lb", p, total)];
  }
  let mode = session.data.mode || "text";
  let page = Number(session.data.page) || 1;
  if (interaction.customId === "lb_toggle_mode") {
    mode = mode === "vc" ? "text" : "vc";
    session.data.mode = mode;
  } else if (interaction.customId === "lb_prev") {
    page = Math.max(1, page - 1);
  } else if (interaction.customId === "lb_next") {
    page = page + 1;
  }
  const src = mode === "vc" ? vcLevels : levels;
  const totalPages = Math.max(1, Math.ceil(Object.keys(src || {}).length / 10));
  if (page > totalPages) page = totalPages;
  session.data.page = page;
  const embed = buildLeaderboardEmbed(member.guild, src, member.id, page, 10, mode);
  await interaction.update({ embeds: [embed], components: rows(mode, page, totalPages) });
});

module.exports = { handleLeaderboardCommand };
