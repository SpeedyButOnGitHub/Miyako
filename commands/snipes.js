const { config } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("./moderation/replies");
const fs = require("fs");
const SNIPES_FILE = "./config/snipes.json";

const snipes = new Map();
// Track last snipe message per channel for editing
const lastSnipeMessage = new Map();

// Load snipes from disk on startup
function loadSnipes() {
  if (fs.existsSync(SNIPES_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(SNIPES_FILE));
      for (const [channelId, snipe] of Object.entries(raw)) {
        // Recalculate expiresAt based on timestamp
        snipe.expiresAt = snipe.timestamp + 2 * 60 * 60 * 1000;
        if (snipe.expiresAt > Date.now()) snipes.set(channelId, snipe);
      }
    } catch {}
  }
}
loadSnipes();

// Save snipes to disk
function saveSnipes() {
  const obj = {};
  for (const [channelId, snipe] of snipes.entries()) {
    obj[channelId] = snipe;
  }
  fs.writeFileSync(SNIPES_FILE, JSON.stringify(obj, null, 2));
}

function formatTodayTime(date) {
  const d = new Date(date);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `Today at ${hours}:${minutes}`;
}

async function handleSnipeCommands(client, message, command, args) {
  const content = message.content.toLowerCase();

  // .ds deletes the previous snipe in this channel
  if (content === ".ds") {
    let replyMsg;
    if (snipes.has(message.channel.id)) {
      snipes.delete(message.channel.id);
      saveSnipes();
      replyMsg = await message.reply(`${EMOJI_SUCCESS} Snipe deleted!`);

      // Edit the last snipe message in this channel if it exists
      const snipeMsg = lastSnipeMessage.get(message.channel.id);
      if (snipeMsg && snipeMsg.editable) {
        try {
          // Clone the previous embed and only change the description
          const oldEmbed = snipeMsg.embeds?.[0];
          if (oldEmbed) {
            const newEmbed = EmbedBuilder.from(oldEmbed)
              .setDescription(`${EMOJI_ERROR} This snipe has been deleted.`);
            await snipeMsg.edit({
              content: null,
              embeds: [newEmbed]
            });
          } else {
            await snipeMsg.edit({
              content: `${EMOJI_ERROR} This snipe has been deleted.`,
              embeds: []
            });
          }
        } catch {}
      }
    } else {
      replyMsg = await message.reply(`${EMOJI_ERROR} No snipe to delete.`);
    }
    setTimeout(() => {
      replyMsg.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 3000);
    return;
  }

  // .snipe and .s both show the last deleted message
  if (content === ".snipe" || content === ".s") {
    // whitelist check
    if (!config.snipingWhitelist.includes(message.channel.id)) {
      return message.reply(`${EMOJI_ERROR} Cannot snipe in this channel!`);
    }

    const snipe = snipes.get(message.channel.id);
    if (!snipe || Date.now() > snipe.expiresAt) {
      return message.reply(`${EMOJI_ERROR} No message has been deleted in the past 2 hours.`);
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
      .setDescription(snipe.content || "*No content (attachment or embed only)*")
      .setColor(0x2f3136)
      .setFooter({ text: formatTodayTime(snipe.timestamp) });

    if (snipe.attachments && snipe.attachments.length > 0) {
      embed.setImage(snipe.attachments[0]);
    }

    const sentMsg = await message.reply({ embeds: [embed] });
    lastSnipeMessage.set(message.channel.id, sentMsg);
    return;
  }
}

function handleMessageDelete(message) {
  if (message.partial || message.author.bot) return;
  const member = message.member || message.guild.members.cache.get(message.author.id);
  const timestamp = Date.now();
  snipes.set(message.channel.id, {
    content: message.content || "*No text content*",
    nickname: member ? member.displayName : message.author.username,
    avatarURL: member ? member.displayAvatarURL({ dynamic: true }) : message.author.displayAvatarURL({ dynamic: true }),
    timestamp,
    attachments: Array.from(message.attachments.values()).map(a => a.url),
    expiresAt: timestamp + 2 * 60 * 60 * 1000
  });
  saveSnipes();
}

module.exports = { handleSnipeCommands, handleMessageDelete };
