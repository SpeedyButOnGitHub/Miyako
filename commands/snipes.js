const { config } = require("../utils/storage");
const { EmbedBuilder } = require("discord.js");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("./moderation/replies");
const fs = require("fs/promises");
const SNIPES_FILE = "./config/snipes.json";

const snipes = new Map();
// Track last snipe message per channel for editing
const lastSnipeMessage = new Map();
// Track last snipe embed data for deleted messages
const lastSnipeEmbedData = new Map();

// Add a persistent deleted flag per channel
const deletedSnipes = new Set();

// Load snipes from disk on startup
async function loadSnipes() {
  try {
    const raw = JSON.parse(await fs.readFile(SNIPES_FILE, "utf8"));
    for (const [channelId, snipe] of Object.entries(raw)) {
      snipe.expiresAt = snipe.timestamp + 2 * 60 * 60 * 1000;
      if (snipe.deleted) {
        deletedSnipes.add(channelId);
        // Save the embed data for deleted snipe fallback
        if (snipe.embedData) lastSnipeEmbedData.set(channelId, snipe.embedData);
      } else if (snipe.expiresAt > Date.now()) {
        snipes.set(channelId, snipe);
        if (snipe.embedData) lastSnipeEmbedData.set(channelId, snipe.embedData);
      }
    }
  } catch (err) {
    // If file doesn't exist or is invalid, ignore
  }
}
loadSnipes();

// Save snipes to disk, including deleted flag and embedData
async function saveSnipes() {
  const obj = {};
  for (const [channelId, snipe] of snipes.entries()) {
    obj[channelId] = { ...snipe, deleted: false, embedData: lastSnipeEmbedData.get(channelId) || null };
  }
  // Save deleted snipes as well
  for (const channelId of deletedSnipes) {
    if (!obj[channelId]) {
      obj[channelId] = {
        deleted: true,
        embedData: lastSnipeEmbedData.get(channelId) || null
      };
    }
  }
  try {
    await fs.writeFile(SNIPES_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error("Failed to save snipes:", err);
  }
}

// Format time as "Today at HH:MM"
function formatTodayTime(date) {
  const d = new Date(date);
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `Today at ${hours}:${minutes}`;
}

// Clean up expired snipes and old snipe messages
function cleanupSnipes() {
  const now = Date.now();
  for (const [channelId, snipe] of snipes.entries()) {
    if (snipe.expiresAt < now) snipes.delete(channelId);
  }
  for (const [channelId, msg] of lastSnipeMessage.entries()) {
    // Remove if message is deleted or too old
    if (!msg || (msg.createdTimestamp && now - msg.createdTimestamp > 2 * 60 * 60 * 1000)) {
      lastSnipeMessage.delete(channelId);
    }
  }
  for (const [channelId, embedData] of lastSnipeEmbedData.entries()) {
    // Remove if too old
    if (embedData && embedData.timestamp && now - embedData.timestamp > 2 * 60 * 60 * 1000) {
      lastSnipeEmbedData.delete(channelId);
    }
  }
}
setInterval(cleanupSnipes, 60 * 1000); // Clean up every minute

async function handleSnipeCommands(client, message, command, args) {
  const content = message.content.toLowerCase();

  // .ds deletes the previous snipe in this channel
  if (content === ".ds") {
    let replyMsg;
    if (snipes.has(message.channel.id) || deletedSnipes.has(message.channel.id)) {
      snipes.delete(message.channel.id);
      deletedSnipes.add(message.channel.id);
      // Do NOT overwrite lastSnipeEmbedData here!
      await saveSnipes();
      replyMsg = await message.reply(`${EMOJI_SUCCESS} Snipe deleted!`);

      // Edit the last snipe message in this channel if it exists
      const snipeMsg = lastSnipeMessage.get(message.channel.id);
      if (snipeMsg && snipeMsg.editable) {
        try {
          const oldEmbed = snipeMsg.embeds?.[0];
          if (oldEmbed) {
            const newEmbed = EmbedBuilder.from(oldEmbed)
              .setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
              .setColor(0xff0000);
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
        } catch (err) {
          console.error("Failed to edit snipe message:", err);
        }
      }
      // Do NOT set lastSnipeMessage to null, keep it for future .snipe/.s
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
    if (!config.snipingWhitelist.includes(message.channel.id)) {
      return message.reply(`${EMOJI_ERROR} Cannot snipe in this channel!`);
    }

    // If snipe was deleted, always show the deleted embed
    if (deletedSnipes.has(message.channel.id)) {
      // Try to show the previous embed with the deleted message notice
      const snipeMsg = lastSnipeMessage.get(message.channel.id);
      if (snipeMsg && snipeMsg.embeds?.[0]) {
        const deletedEmbed = EmbedBuilder.from(snipeMsg.embeds[0])
          .setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
          .setColor(0xff0000);
        return message.reply({ embeds: [deletedEmbed] });
      }
      // If we have saved embed data, reconstruct the deleted embed
      const embedData = lastSnipeEmbedData.get(message.channel.id);
      if (embedData) {
        const deletedEmbed = new EmbedBuilder(embedData)
          .setDescription(`${EMOJI_ERROR} This snipe has been deleted.`)
          .setColor(0xff0000);
        return message.reply({ embeds: [deletedEmbed] });
      }
      return message.reply(`${EMOJI_ERROR} This snipe has been deleted.`);
    }

    const snipe = snipes.get(message.channel.id);
    // If snipe expired, fallback to deleted logic
    if (!snipe || Date.now() > snipe.expiresAt) {
      return message.reply(`${EMOJI_ERROR} No message has been deleted in the past 2 hours.`);
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: snipe.nickname, iconURL: snipe.avatarURL })
      .setDescription(snipe.content || "*No content (attachment or embed only)*")
      .setColor(0x5865F2) // Discord blurple for normal snipes
      .setFooter({ text: formatTodayTime(snipe.timestamp) });

    if (snipe.attachments && snipe.attachments.length > 0) {
      embed.setImage(snipe.attachments[0]);
    }

    const sentMsg = await message.reply({ embeds: [embed] });
    lastSnipeMessage.set(message.channel.id, sentMsg);
    // Save the embed data for deleted snipe fallback (only here!)
    lastSnipeEmbedData.set(message.channel.id, { ...embed.data, timestamp: Date.now() });
    await saveSnipes();
    return;
  }
}

// Only snipe non-bot, non-self messages
function handleMessageDelete(message) {
  // Ignore partials, bot messages, self messages, and commands (messages starting with .)
  if (
    message.partial ||
    message.author.bot ||
    (message.client && message.author.id === message.client.user.id) ||
    (typeof message.content === "string" && message.content.trim().startsWith("."))
  ) return;

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