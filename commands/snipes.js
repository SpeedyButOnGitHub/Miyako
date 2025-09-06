const { config } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");

const snipes = new Map();

async function handleSnipeCommands(client, message, command, args) {
  const content = message.content.toLowerCase();

  if (content === ".ds") {
    const snipe = snipes.get(message.channel.id);
    if (snipe) {
      snipe.deleted = true;
      snipes.set(message.channel.id, snipe);
      return message.reply("✅ Snipe deleted!");
    }
    return message.reply("⚠️ No snipe to delete.");
  }

  if (content === ".snipe" || content === ".s") {
    if (!config.snipingWhitelist.includes(message.channel.id)) {
      await message.reply("❌ This channel is not whitelisted for sniping.");
      return;
    }
    const snipe = snipes.get(message.channel.id);
    if (!snipe || Date.now() > snipe.expiresAt) {
      await message.reply("⚠️ No message has been deleted in the past 2 hours.");
      return;
    }

    let displayContent = snipe.deleted ? "⚠️ This snipe has been deleted" : snipe.content;
    if (displayContent.length > 1024) displayContent = displayContent.slice(0, 1021) + "...(truncated)";

    const embed = new EmbedBuilder()
      .setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
      .setDescription(displayContent)
      .setColor(0x2c2f33);

    if (!snipe.deleted && snipe.attachments.length > 0) embed.setImage(snipe.attachments[0]);

    await message.reply({ embeds: [embed] });
  }
}

function handleMessageDelete(message) {
  if (message.partial || message.author.bot) return;
  const member = message.member || message.guild.members.cache.get(message.author.id);
  snipes.set(message.channel.id, {
    content: message.content || "*No text content*",
    nickname: member ? member.displayName : message.author.username,
    avatarURL: member ? member.displayAvatarURL({ dynamic: true }) : message.author.displayAvatarURL({ dynamic: true }),
    timestamp: Date.now(),
    attachments: message.attachments.map(a => a.url),
    deleted: false,
    expiresAt: Date.now() + 2*60*60*1000
  });
}

module.exports = { handleSnipeCommands, handleMessageDelete };
