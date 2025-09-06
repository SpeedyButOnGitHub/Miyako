const { EmbedBuilder } = require("discord.js");

async function sendUserDM(target, action, duration = null, reason = null, extra = null) {
  const embed = new EmbedBuilder()
    .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL({ dynamic: true }) })
    .setColor(action === "warned" ? 0xffff00 : ["warning removed"].includes(action) ? 0x00ff00 : 0xff0000)
    .setDescription(
      action === "warned" ? `You have been warned in Late Night Hours.` :
      action === "warning removed" ? `A warning has been removed from your account.` :
      `You have been ${action} in Late Night Hours.`
    );
  if (duration) embed.addFields({ name: "Duration", value: duration, inline: true });
  if (reason) embed.addFields({ name: "Reason", value: reason, inline: true });
  if (extra) embed.addFields({ name: "Info", value: extra, inline: false });
  embed.setTimestamp();
  try {
    await target.send({ embeds: [embed] });
  } catch (err) {
    console.log(`Could not DM ${target.user.tag}: ${err.message}`);
  }
}
module.exports = { sendUserDM };