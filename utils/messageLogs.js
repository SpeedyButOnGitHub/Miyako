const { EmbedBuilder } = require("discord.js");
const MESSAGE_LOG_CHANNEL = "1232701769859993622";

async function logMessageDelete(client, message) {
  const channel = await client.channels.fetch(MESSAGE_LOG_CHANNEL).catch(() => null);
  if (!channel || !message.guild || !message.author || message.author.bot) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Deleted")
    .setColor(0xff5555)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setDescription(message.content || "*No content*")
    .addFields({ name: "Channel", value: `<#${message.channel.id}>`, inline: true })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function logMessageEdit(client, oldMessage, newMessage) {
  const channel = await client.channels.fetch(MESSAGE_LOG_CHANNEL).catch(() => null);
  if (!channel || !oldMessage.guild || !oldMessage.author || oldMessage.author.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Edited")
    .setColor(0xffcc00)
    .setAuthor({ name: oldMessage.author.tag, iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }) })
    .addFields(
      { name: "Before", value: oldMessage.content || "*No content*", inline: false },
      { name: "After", value: newMessage.content || "*No content*", inline: false },
      { name: "Channel", value: `<#${oldMessage.channel.id}>`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

module.exports = {
  logMessageDelete,
  logMessageEdit
};