const { config } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");

const snipes = new Map();

async function handleSnipeCommands(client, message, command, args) {
  const content = message.content.toLowerCase();

  // .ds deletes the previous snipe in this channel
  if (content === ".ds") {
    if (snipes.has(message.channel.id)) {
      snipes.delete(message.channel.id);
      return message.reply("✅ Snipe deleted!");
    }
    return message.reply("⚠️ No snipe to delete.");
  }

  // .snipe and .s both show the last deleted message
  if (content === ".snipe" || content === ".s") {
    // whitelist check
    if (!config.snipingWhitelist.includes(message.channel.id)) {
      return message.reply("❌ Cannot snipe in this channel!");
    }

    const snipe = snipes.get(message.channel.id);
    if (!snipe || Date.now() > snipe.expiresAt) {
      return message.reply("⚠️ No message has been deleted in the past 2 hours.");
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
      .setDescription(snipe.content || "*No content (attachment or embed only)*")
      .setColor(0x2f3136)
      .setFooter({ text: `Deleted • ${new Date(snipe.timestamp).toLocaleString()}` });

    if (snipe.attachments && snipe.attachments.length > 0) {
      embed.setImage(snipe.attachments[0]);
    }

    return message.reply({ embeds: [embed] });
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
    attachments: Array.from(message.attachments.values()).map(a => a.url),
    expiresAt: Date.now() + 2 * 60 * 60 * 1000
  });
}

module.exports = { handleSnipeCommands, handleMessageDelete };
