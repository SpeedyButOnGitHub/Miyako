const { sendModLog } = require("../../utils/modLogs");
const { replySuccess, replyError } = require("./replies");
const { sendUserDM } = require("./dm");
const { isModerator } = require("./permissions");
const { config, saveConfig } = require("../../utils/storage");
const ms = require("ms");

const OWNER_ID = process.env.OWNER_ID || "349282473085239298";
const MUTE_ROLE_ID = "1391535514901020744";
const DEFAULT_MUTE = config.defaultMuteDuration || 60 * 60 * 1000;

function formatDuration(duration) {
  return ms(duration, { long: true });
}

async function handleModerationCommands(client, message, command, args) {
  if (!isModerator(message.member)) return replyError(message, "You are not allowed to use this command.");
  const target = message.mentions.members.first() || (args[0] && await message.guild.members.fetch(args[0]).catch(() => null));
  if (!target) return replyError(message, "You must mention a user or provide a valid user ID.");

  if (target.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
  if (target.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
  if (target.roles.highest.comparePositionTo(message.member.roles.highest) >= 0 && message.author.id !== OWNER_ID)
    return replyError(message, "You cannot moderate this user due to role hierarchy.");
  if (config.moderatorRoles.some(roleId => target.roles.cache.has(roleId)))
    return replyError(message, "Cannot moderate this user (they are a configured moderator).");

  let reason = args.slice(1).join(" ") || null;
  let duration = ["mute","timeout"].includes(command) ? ms(args[1]) || DEFAULT_MUTE : null;
  let durationDisplay = duration ? formatDuration(duration) : null;

  try {
    switch(command) {
      case "mute":
        if (!target.moderatable) throw new Error("Cannot mute this person.");
        await target.timeout(duration, reason || `Muted by ${message.author.tag}`);
        if (!target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.add(MUTE_ROLE_ID).catch(() => {});
        await sendModLog(client, target, message.author, "muted", reason, true, durationDisplay);
        await sendUserDM(target, "muted", durationDisplay, reason);
        await replySuccess(message, `Muted ${target} for ${durationDisplay}`);
        break;

      case "unmute":
        await target.timeout(null, `Unmuted by ${message.author.tag}`);
        if (target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.remove(MUTE_ROLE_ID).catch(() => {});
        await sendModLog(client, target, message.author, "unmuted", null, false);
        await sendUserDM(target, "unmuted");
        await replySuccess(message, `Unmuted ${target}`);
        break;

      case "warn":
        let warnings = config.warnings[target.id] || [];
        warnings.push({ moderator: message.author.id, reason, date: Date.now() });
        config.warnings[target.id] = warnings;
        saveConfig();

        let escalationMessage = null;
        if (warnings.length >= (config.escalation?.kickThreshold || 3)) {
          await target.kick("Auto-kicked for reaching warning threshold");
          escalationMessage = `You have been kicked for reaching ${config.escalation.kickThreshold || 3} warnings.`;
          await sendModLog(client, target, message.author, "kicked", "Reached warning threshold", true, null, warnings.length);
        } else if (warnings.length >= (config.escalation?.muteThreshold || 2)) {
          const muteDur = config.escalation?.muteDuration || 2 * 60 * 60 * 1000;
          await target.timeout(muteDur, "Auto-muted for reaching warning threshold");
          if (!target.roles.cache.has(MUTE_ROLE_ID)) await target.roles.add(MUTE_ROLE_ID).catch(() => {});
          escalationMessage = `You have been muted for ${formatDuration(muteDur)} for reaching ${config.escalation.muteThreshold || 2} warnings.`;
          await sendModLog(client, target, message.author, "muted", "Reached warning threshold", true, formatDuration(muteDur), warnings.length);
        }

        await sendUserDM(target, "warned", null, reason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        await sendModLog(client, target, message.author, "warned", reason, true, null, warnings.length);
        await replySuccess(message, `Warned ${target}${reason ? ` for: ${reason}` : ""}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        break;
    }
  } catch (err) {
    console.error("Error in moderation command:", err);
    await replyError(message, "An error occurred while executing this command.");
  }
}

module.exports = { handleModerationCommands };