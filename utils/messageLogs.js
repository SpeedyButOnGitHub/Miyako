const { EmbedBuilder } = require("discord.js");
const { config } = require("./storage");
const theme = require("./theme");
const { applyStandardFooter } = require("./ui");
const { MESSAGE_LOG_CHANNEL, TEST_LOG_CHANNEL } = require("./logChannels");
const { logError } = require("./errorUtil");

async function logMessageDelete(client, message) {
  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(e => { logError('messageLogs:deleteFetch', e); return null; });
  if (!channel || !message || !message.guild || !message.author || message.author.bot) return;

  const embed = new EmbedBuilder()
    .setTitle(`${theme.emojis.delete} Message Deleted`)
    .setColor(theme.colors.danger)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setDescription(message.content || "*No content*")
    .addFields({ name: "Channel", value: `<#${message.channel.id}>`, inline: true })
    .setTimestamp();
  applyStandardFooter(embed, message.guild, { testingMode: config.testingMode });

  try { await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }); } catch (e) { logError('messageLogs:deleteSend', e); }
}

async function logMessageEdit(client, oldMessage, newMessage) {
  const logChannelId = config.testingMode ? TEST_LOG_CHANNEL : MESSAGE_LOG_CHANNEL;
  const channel = await client.channels.fetch(logChannelId).catch(e => { logError('messageLogs:editFetch', e); return null; });
  if (!channel || !oldMessage || !newMessage) return;
  if (!newMessage.guild || (newMessage.author && newMessage.author.bot)) return;

  const embed = new EmbedBuilder()
    .setTitle(`${theme.emojis.edit} Message Edited`)
    .setColor(theme.colors.warning)
    .setAuthor({ name: (newMessage.author && newMessage.author.tag) || "Unknown", iconURL: newMessage.author ? newMessage.author.displayAvatarURL({ dynamic: true }) : undefined })
    .addFields(
      { name: "Channel", value: `<#${newMessage.channel.id}>`, inline: true },
      { name: "Before", value: oldMessage.content || "*No content*" },
      { name: "After", value: newMessage.content || "*No content*" }
    )
    .setTimestamp();
  applyStandardFooter(embed, newMessage.guild, { testingMode: config.testingMode });

  try { await channel.send({ embeds: [embed] }); } catch (e) { logError('messageLogs:editSend', e); }
}

module.exports = { logMessageDelete, logMessageEdit };