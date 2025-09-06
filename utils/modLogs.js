import { EmbedBuilder } from "discord.js";

// Only log moderation actions in the user action channel
const USER_ACTION_LOG_CHANNEL = "1232701768383729791";

/**
 * Logs moderation actions in the user action channel only
 * @param {Client} client - Discord client
 * @param {GuildMember} target - Member being moderated
 * @param {User} moderator - User who issued the action
 * @param {string} action - Action name: muted, unmuted, banned, warned, warning removed, etc.
 * @param {string|null} reason - Reason for action
 * @param {boolean} isPunishment - True if punishment, false if reversal
 * @param {string|null} duration - Duration of punishment if applicable
 * @param {number|null} currentWarnings - Current warning count (optional)
 * @returns {Promise<Message|null>} - Sent message object
 */
async function sendModLog(client, target, moderator, action, reason = null, isPunishment = true, duration = null, currentWarnings = null) {
  const channel = await client.channels.fetch(USER_ACTION_LOG_CHANNEL).catch(() => null);
  if (!channel) return null;

  const colors = {
    muted: 0xff0000,
    banned: 0xff0000,
    kicked: 0xff0000,
    warned: 0xffff00,
    "warning removed": 0x00ff00,
    unmuted: 0x00ff00,
    "timeout removed": 0x00ff00,
    untimeout: 0x00ff00,
    "timed out": 0xff0000
  };

  const color = colors[action] || (isPunishment ? 0xff0000 : 0x00ff00);

  let description;
  switch(action) {
    case "warned":
      description = `<@${target.id}> has received a **warning**.`;
      break;
    case "warning removed":
      description = `A **warning** has been removed from <@${target.id}>.`;
      break;
    case "muted":
      description = `<@${target.id}> has been **muted**${duration ? ` for ${duration}` : ""}.`;
      break;
    case "unmuted":
      description = `<@${target.id}> has been **unmuted**.`;
      break;
    case "timed out":
      description = `<@${target.id}> has been **timed out**${duration ? ` for ${duration}` : ""}.`;
      break;
    case "untimeout":
    case "timeout removed":
      description = `<@${target.id}>'s timeout has been removed.`;
      break;
    case "banned":
      description = `<@${target.id}> has been **banned**.`;
      break;
    case "kicked":
      description = `<@${target.id}> has been **kicked**.`;
      break;
    default:
      description = `<@${target.id}> has been **${action}**.`;
      break;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: target.displayName, iconURL: target.displayAvatarURL({ dynamic: true }) })
    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
    .setColor(color)
    .setDescription(description);

  const fields = [
    { name: "Responsible Moderator", value: `<@${moderator.id}>`, inline: true }
  ];
  if (duration) fields.push({ name: "Duration", value: duration, inline: true });
  if (reason) fields.push({ name: "Reason", value: reason, inline: false });
  if (currentWarnings !== null) fields.push({ name: "Current Warnings", value: `${currentWarnings}`, inline: true });

  if (fields.length) embed.addFields(fields);
  embed.setTimestamp();

  const msg = await channel.send({ embeds: [embed] }).catch(err => {
    console.error("Failed to send mod log:", err);
    return null;
  });
  if (msg) {
    console.log("Mod log sent, message ID:", msg.id);
  } else {
    console.log("Mod log not sent!");
  }
  return msg;
}

export { sendModLog };

const logMsg = await sendModLog(client, member, message.author, "muted", finalReason, true, formatDuration(finalDuration));
if (isTesting && logMsg && logMsg.id) testLogMessageIds.push(logMsg.id);
