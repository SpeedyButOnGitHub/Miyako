const { EmbedBuilder } = require("discord.js");
const { getXP, getLevel, levels } = require("../utils/leveling");

function getLevelXP(level) {
  // This should match your level curve in utils/levels.js
  // Reverse the formula: xp = 50 * (level ** (1/0.7))
  return Math.floor(50 * Math.pow(level, 1 / 0.7));
}

// Helper to create a neat progress bar
function createProgressBar(current, max, size = 20) {
  const filled = Math.round((current / max) * size);
  const empty = size - filled;
  return `\`${"█".repeat(filled)}${"░".repeat(empty)}\` ${current} / ${max}`;
}

async function handleLevelCommand(client, message) {
  const userId = message.author.id;
  const xp = getXP(userId);
  const level = getLevel(userId);
  const nextLevel = level + 1;
  const xpForNextLevel = getLevelXP(nextLevel);
  const xpForCurrentLevel = getLevelXP(level);
  const xpIntoLevel = xp - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;

  const progressBar = createProgressBar(xpIntoLevel, xpNeeded, 24);

  const embed = new EmbedBuilder()
    .setTitle(`🌙 Level Info for ${message.member?.displayName || message.author.username}`)
    .setColor(0x5865F2)
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "Level", value: `${level}`, inline: true },
      { name: "XP", value: `${xp}`, inline: true },
      { name: "XP to Next Level", value: `${xpForNextLevel - xp}`, inline: true },
    )
    .addFields({ name: "Progress", value: progressBar })
    .setFooter({ text: `XP this level: ${xpIntoLevel} / ${xpNeeded}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  handleLevelCommand
};