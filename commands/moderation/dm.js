const { EmbedBuilder } = require("discord.js");

async function sendUserDM(target, action, duration = null, reason = null, extra = null) {
  let description;
  let color;
  switch (action) {
    case "warned":
      description = "⚠️ You have been warned in **Late Night Hours**.";
      color = 0xffff00;
      break;
    case "warning removed":
      description = "✅ A warning has been removed from your account.";
      color = 0x00ff00;
      break;
    case "kicked":
      description = "👢 You have been **kicked** from **Late Night Hours**.";
      color = 0xff0000;
      break;
    case "banned":
      description = "🔨 You have been **banned** from **Late Night Hours**.";
      color = 0xff0000;
      break;
    case "muted":
      description = "🔇 You have been **muted** in **Late Night Hours**.";
      color = 0xff0000;
      break;
    case "unmuted":
      description = "🔊 You have been **unmuted** in **Late Night Hours**.";
      color = 0x00ff00;
      break;
    default:
      description = `ℹ️ You have been **${action}** in **Late Night Hours**.`;
      color = 0x5865F2;
      break;
  }

  const user = target?.user || target; // support GuildMember or User
  const avatar = user?.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : undefined;
  const embed = new EmbedBuilder()
    .setAuthor({ name: user?.tag || user?.username || "User", iconURL: avatar })
    .setColor(color)
    .setDescription(description);

  if (reason) embed.addFields({ name: "📝 Reason", value: reason, inline: true });
  if (duration) embed.addFields({ name: "⏰ Duration", value: duration, inline: true });
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