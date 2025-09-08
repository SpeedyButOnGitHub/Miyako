const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");
const theme = require("./theme");

const MESSAGE_LOG_CHANNEL = "1232701769859993622";
const TEST_LOG_CHANNEL = "1413966369296220233";

async function logMessageDelete(client, message) {
  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel || !message || !message.guild || !message.author || message.author.bot) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Deleted")
    .setColor(theme.colors.danger)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setDescription(message.content || "*No content*")
    .addFields({ name: "Channel", value: `<#${message.channel.id}>`, inline: true })
    .setTimestamp();

  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
}

async function logMessageEdit(client, oldMessage, newMessage) {
  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel || !oldMessage || !newMessage) return;
  if (!newMessage.guild || (newMessage.author && newMessage.author.bot)) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Edited")
    .setColor(0xffd700)
    .setAuthor({ name: (newMessage.author && newMessage.author.tag) || "Unknown", iconURL: newMessage.author ? newMessage.author.displayAvatarURL({ dynamic: true }) : undefined })
    .addFields(
      { name: "Channel", value: `<#${newMessage.channel.id}>`, inline: true },
      { name: "Before", value: oldMessage.content || "*No content*" },
      { name: "After", value: newMessage.content || "*No content*" }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { logMessageDelete, logMessageEdit };