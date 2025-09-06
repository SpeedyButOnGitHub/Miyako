const { EmbedBuilder } = require("discord.js");
const { MESSAGE_LOG_CHANNEL } = require("./logChannels");

async function logMessageDelete(client, message) {
  const channel = await client.channels.fetch(MESSAGE_LOG_CHANNEL).catch(() => null);
  if (!channel || !message.guild || message.author.bot) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Deleted")
    .setColor(0xff5555)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
    .setDescription(message.content || "*No content*")
    .addFields({ name: "Channel", value: `<#${message.channel.id}>`, inline: true })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function logMessageEdit(client, oldMsg, newMsg) {
  const channel = await client.channels.fetch(MESSAGE_LOG_CHANNEL).catch(() => null);
  if (!channel || !oldMsg.guild || !oldMsg.author || oldMsg.author.bot) return;
  if (oldMsg.content === newMsg.content) return;

  const embed = new EmbedBuilder()
    .setTitle("Message Edited")
    .setColor(0xffcc00)
    .setAuthor({ name: oldMsg.author.tag, iconURL: oldMsg.author.displayAvatarURL({ dynamic: true }) })
    .addFields(
      { name: "Before", value: oldMsg.content || "*No content*", inline: false },
      { name: "After", value: newMsg.content || "*No content*", inline: false },
      { name: "Channel", value: `<#${oldMsg.channel.id}>`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

export { logMessageDelete, logMessageEdit };