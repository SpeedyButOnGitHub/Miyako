const { EmbedBuilder } = require("discord.js");
const { isModerator } = require("./moderation");

async function handleHelpCommand(client, message) {
  if (!message.guild) return;

  const embed = new EmbedBuilder()
    .setTitle("📜 Help Menu")
    .setColor(0x1abc9c) // teal border for overall embed
    .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setTimestamp();

  if (isModerator(message.member)) {
    embed.setDescription("**Moderator Commands:**\nUse `.command (user) (time) (reason)` format where applicable.");

    embed.addFields(
      { name: "🔇 Mute", value: "**`.mute (user) (time) (reason)`**\nDefault duration: 1 hour", inline: false },
      { name: "✅ Unmute", value: "**`.unmute (user)`**", inline: false },
      { name: "⏱️ Timeout", value: "**`.timeout (user) (time) (reason)`**\nDefault duration: 1 hour", inline: false },
      { name: "⏹️ Untimeout", value: "**`.untimeout (user)`**", inline: false },
      { name: "🔨 Ban", value: "**`.ban (user) (reason)`**", inline: false },
      { name: "👢 Kick", value: "**`.kick (user) (reason)`**", inline: false },
      { name: "⚠️ Warn", value: "**`.warn (user) (reason)`**\nDefault reason: 'You have been warned in Late Night Hours'.", inline: false }
    );
  } else {
    embed.setDescription("**Available Commands:**");
    embed.addFields(
      { name: "❓ .help", value: "Shows this help menu.", inline: false }
    );
  }

  await message.channel.send({ embeds: [embed] });
}

module.exports = { handleHelpCommand };
