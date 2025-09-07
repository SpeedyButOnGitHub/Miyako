const { EmbedBuilder } = require("discord.js");
const { getXP, getLevel } = require("../utils/levels");

function getLevelXP(level) {
  return Math.floor(50 * Math.pow(level, 1 / 0.7));
}

function createProgressBar(current, max, size = 24) {
  const safeMax = Math.max(1, max);
  const filled = Math.min(size, Math.max(0, Math.round((current / safeMax) * size)));
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
  const xpIntoLevel = Math.max(0, xp - xpForCurrentLevel);
  const xpNeeded = Math.max(1, xpForNextLevel - xpForCurrentLevel);

  const progressBar = createProgressBar(xpIntoLevel, xpNeeded, 24);

  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Profile`)
    .setColor(0x5865F2)
    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "Level", value: `${level}`, inline: true },
      { name: "XP", value: `${xp}`, inline: true },
      { name: `Progress to ${nextLevel}`, value: progressBar }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});
}

module.exports = { handleLevelCommand };