const ActiveMenus = require("../utils/activeMenus");
const { levels } = require("../utils/levels");
const { vcLevels } = require("../utils/vcLevels");
// Reuse profile navigation system so .lb has Profile / Rank / Leaderboard buttons
const { buildLeaderboardEmbed: sharedLBEmbed, buildRows } = require("./profile");

async function handleLeaderboardCommand(client, message) {
  const guild = message.guild;
  if (!guild) return;
  const member = message.member;
  if (!member) return;
  const mode = "text"; // initial mode
  const page = 1;
  const source = mode === "vc" ? vcLevels : levels;
  const embed = sharedLBEmbed(guild, source, member.id, page, 10, mode);
  const totalPages = Math.max(1, Math.ceil(Object.keys(source || {}).length / 10));
  // Use profile buildRows so nav includes Profile / Rank / Leaderboard
  const rows = buildRows("leaderboard", page, totalPages, mode);
  const sent = await message.reply({ embeds: [embed], components: rows, allowedMentions: { repliedUser: false } }).catch(() => null);
  if (sent) {
    // Register as a profile session so existing handler manages navigation & pagination
    ActiveMenus.registerMessage(sent, { type: "profile", userId: member.id, data: { view: "leaderboard", page, mode } });
  }
}
module.exports = { handleLeaderboardCommand };
