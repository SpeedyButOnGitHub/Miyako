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

async function findTarget(message, args) {
  let target = null;
  let reasonArgs = args;

  // 1. Mention
  if (message.mentions.members.size > 0) {
    target = message.mentions.members.first();
    reasonArgs = args.slice(1);
  }
  // 2. User ID
  else if (args[0]) {
    target = await message.guild.members.fetch(args[0]).catch(() => null);
    if (target) reasonArgs = args.slice(1);
  }
  // 3. Username or nickname (case-insensitive)
  if (!target && args[0]) {
    const search = args[0].toLowerCase();
    target = message.guild.members.cache.find(
      m =>
        m.user.username.toLowerCase() === search ||
        (m.nickname && m.nickname.toLowerCase() === search)
    );
    if (target) reasonArgs = args.slice(1);
  }

  // 4. Fallback: Try to fetch as a User if not found as a member
  let user = null;
  if (!target && args[0]) {
    user = await message.client.users.fetch(args[0]).catch(() => null);
    if (user) reasonArgs = args.slice(1);
  }

  return { target, user, reasonArgs };
}

async function handleModerationCommands(client, message, command, args) {
  if (!isModerator(message.member)) return replyError(message, "You are not allowed to use this command.");

  const { target, user, reasonArgs } = await findTarget(message, args);

  // If neither member nor user found, error
  if (!target && !user) return replyError(message, "You must mention a user, provide a valid user ID, or type their username/nickname.");

  // Use member if available, else fallback to user
  const member = target;
  const userObj = member ? member.user : user;

  // Prevent self/owner/moderator actions only if member is present
  if (member) {
    if (member.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
    if (member.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
    if (member.roles.highest.comparePositionTo(message.member.roles.highest) >= 0 && message.author.id !== OWNER_ID)
      return replyError(message, "You cannot moderate this user due to role hierarchy.");
    if (config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)))
      return replyError(message, "Cannot moderate this user (they are a configured moderator).");
  } else {
    // If only user object, block self/owner actions
    if (userObj.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
    if (userObj.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
  }

  // Ensure escalation config exists
  const escalation = config.escalation || {};
  const kickThreshold = typeof escalation.kickThreshold === "number" ? escalation.kickThreshold : 3;
  const muteThreshold = typeof escalation.muteThreshold === "number" ? escalation.muteThreshold : 2;
  const muteDuration = typeof escalation.muteDuration === "number" ? escalation.muteDuration : 2 * 60 * 60 * 1000;

  let reason = null;
  if (command === "warn") {
    reason = reasonArgs.join(" ").trim();
    if (!reason) reason = "No reason provided";
  } else {
    reason = reasonArgs.join(" ") || null;
  }

  let duration = ["mute","timeout"].includes(command) ? ms(args[1]) || DEFAULT_MUTE : null;
  let durationDisplay = duration ? formatDuration(duration) : null;

  try {
    switch(command) {
      case "mute":
        if (!member || !member.moderatable) throw new Error("Cannot mute this person.");
        await member.timeout(duration, reason || `Muted by ${message.author.tag}`);
        if (!member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.add(MUTE_ROLE_ID).catch(() => {});
        await sendModLog(client, member, message.author, "muted", reason, true, durationDisplay);
        await sendUserDM(member, "muted", durationDisplay, reason);
        await replySuccess(message, `Muted ${member} for ${durationDisplay}`);
        break;

      case "unmute":
        if (!member) throw new Error("Cannot unmute this person.");
        await member.timeout(null, `Unmuted by ${message.author.tag}`);
        if (member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.remove(MUTE_ROLE_ID).catch(() => {});
        await sendModLog(client, member, message.author, "unmuted", null, false);
        await sendUserDM(member, "unmuted");
        await replySuccess(message, `Unmuted ${member}`);
        break;

      case "warn":
        // Always use user ID for warnings
        const warnId = userObj.id;
        if (!Array.isArray(config.warnings[warnId])) config.warnings[warnId] = [];
        let warnings = config.warnings[warnId];
        warnings.push({ moderator: message.author.id, reason, date: Date.now() });
        saveConfig();

        let escalationMessage = null;
        // Only escalate if member is present in guild
        if (member && warnings.length >= kickThreshold) {
          await member.kick("Auto-kicked for reaching warning threshold");
          escalationMessage = `You have been kicked for reaching ${kickThreshold} warnings.`;
          await sendModLog(client, member, message.author, "kicked", "Reached warning threshold", true, null, warnings.length);
        } else if (member && warnings.length >= muteThreshold) {
          await member.timeout(muteDuration, "Auto-muted for reaching warning threshold");
          if (!member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.add(MUTE_ROLE_ID).catch(() => {});
          escalationMessage = `You have been muted for ${formatDuration(muteDuration)} for reaching ${muteThreshold} warnings.`;
          await sendModLog(client, member, message.author, "muted", "Reached warning threshold", true, formatDuration(muteDuration), warnings.length);
        }

        // Send DM using member if present, else user object
        if (member) {
          await sendUserDM(member, "warned", null, reason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        } else if (userObj) {
          await sendUserDM(userObj, "warned", null, reason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        }
        await sendModLog(client, member || userObj, message.author, "warned", reason, true, null, warnings.length);

        await replySuccess(
          message,
          `Warned <@${warnId}> for: **${reason}**${escalationMessage ? `\n${escalationMessage}` : ""}`
        );
        break;
    }
  } catch (err) {
    console.error("Error in moderation command:", err);
    await replyError(message, "An error occurred while executing this command.");
  }
}

module.exports = { handleModerationCommands };