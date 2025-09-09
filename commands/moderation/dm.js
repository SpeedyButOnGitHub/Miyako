const { EmbedBuilder } = require("discord.js");
const theme = require("../../utils/theme");
const { applyStandardFooter } = require("../../utils/ui");

async function sendUserDM(target, action, duration = null, reason = null, extra = null) {
  let description;
  let color;
  const a = String(action || "");
  const al = a.toLowerCase();
  switch (al) {
    case "warned":
      description = `${theme.emojis.warn} You have been warned in **Late Night Hours**.`;
      color = theme.colors.warning;
      break;
    default:
      if (al.startsWith("warning removed")) {
        // Parse optional count from patterns like "warning removed x3"
        const m = al.match(/x(\d+)/);
        const count = Math.max(1, m ? parseInt(m[1], 10) || 1 : 1);
        const plural = count === 1 ? "warning has" : "warnings have";
  description = `${theme.emojis.success} ${count} ${plural} been removed from your account in **Late Night Hours**.`;
  color = theme.colors.success;
      } else if (al === "kicked") {
  description = "👢 You have been **kicked** from **Late Night Hours**.";
  color = theme.colors.danger;
      } else if (al === "banned") {
  description = "🔨 You have been **banned** from **Late Night Hours**.";
  color = theme.colors.danger;
      } else if (al === "muted") {
  description = "🔇 You have been **muted** in **Late Night Hours**.";
  color = theme.colors.danger;
      } else if (al === "unmuted") {
        description = `${theme.emojis.unmute || "🔊"} You have been **unmuted** in **Late Night Hours**.`;
        color = theme.colors.success;
      } else {
        description = `${theme.emojis.info} You have been **${a}** in **Late Night Hours**.`;
        color = theme.colors.primary;
      }
      break;
  }

  const user = target?.user || target; // support GuildMember or User
  const avatar = user?.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined;
  const embed = new EmbedBuilder()
    .setAuthor({ name: user?.tag || user?.username || "User", iconURL: avatar })
    .setColor(color)
    .setDescription(description);

  // For removal DMs, omit the Reason field entirely to reduce noise
  if (!al.startsWith("warning removed") && reason) embed.addFields({ name: "📝 Reason", value: reason, inline: true });
  if (duration) embed.addFields({ name: `${theme.emojis.duration} Duration`, value: duration, inline: true });
  if (extra) embed.addFields({ name: "ℹ️ Info", value: extra, inline: false });
  embed.setTimestamp();

  try {
    if (typeof target.send === "function") {
      await target.send({ embeds: [embed] });
    } else if (typeof user?.send === "function") {
      await user.send({ embeds: [embed] });
    }
  } catch (err) {
    const tag = user?.tag || user?.username || user?.id || "unknown";
    console.error(`[DM Error] Could not DM ${tag}:`, err);
  }
}

module.exports = {
  sendUserDM
};