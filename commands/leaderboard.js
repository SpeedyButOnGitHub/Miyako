const ActiveMenus = require("../utils/activeMenus");
// Use cached leaderboard service for efficiency
const { buildLeaderboardEmbed: cachedLBEmbed } = require('../services/leaderboardService');
// Reuse profile navigation system so .lb has Profile / Rank / Leaderboard buttons
const { buildRows } = require("./profile");

async function handleLeaderboardCommand(client, message) {
  const guild = message.guild;
  if (!guild) return;
  const member = message.member;
  if (!member) return;
  const mode = "text"; // initial mode
  const page = 1;
  const embed = cachedLBEmbed(guild, member.id, page, 10, mode);
  // total pages derived by service entries length (recompute locally via getEntries if needed)
  const { getEntries } = require('../services/leaderboardService');
  const totalPages = Math.max(1, Math.ceil(getEntries(mode).length / 10));
  // Use profile buildRows so nav includes Profile / Rank / Leaderboard
  const rows = buildRows("leaderboard", page, totalPages, mode);
  const sent = await message.reply({ embeds: [embed], components: rows, allowedMentions: { repliedUser: false } }).catch(() => null);
  if (sent) {
    // Register as a profile session so existing handler manages navigation & pagination
    ActiveMenus.registerMessage(sent, { type: "profile", userId: member.id, data: { view: "leaderboard", page, mode } });
  }
}
module.exports = { handleLeaderboardCommand };
