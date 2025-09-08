const { EmbedBuilder } = require("discord.js");

const STATUS_CHANNEL_ID = "1413966369296220233";

async function updateTestingStatus(client, enabled, actor) {
  try {
    const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(enabled ? "🧪 Testing Mode Enabled" : "🧪 Testing Mode Disabled")
      .setColor(enabled ? 0xffd700 : 0x5865f2)
      .setDescription(
        enabled
          ? `Certain logs will be routed to the test channel. The warnings UI may use seeded data.${actor ? `\nTriggered by: <@${actor.id}>` : ""}`
          : `Bot has returned to normal operation.${actor ? `\nTriggered by: <@${actor.id}>` : ""}`
      )
      .setTimestamp();

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  } catch {}
}

module.exports = { updateTestingStatus };
