const { sendModLog } = require("../../utils/modLogs");
const { replySuccess, replyError } = require("./replies");
const { sendUserDM } = require("./dm");
const { isModerator } = require("./permissions");
const { config, saveConfig } = require("../../utils/storage");
const ms = require("ms");
const { parseDurationAndReason } = require("../../utils/time");
const { testLogMessageIds } = require("../test");

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

  const isTesting = !!config.testingMode;
  // Ensure escalation config exists early (used in checks below)
  const escalation = config.escalation || {};

  // Restriction checks only if NOT in testing mode
  if (!isTesting) {
    if (member) {
      if (member.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
      if (member.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
      if (member.roles.highest.comparePositionTo(message.member.roles.highest) >= 0 && message.author.id !== OWNER_ID)
        return replyError(message, "You cannot moderate this user due to role hierarchy.");
      if (config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)) ||
          (escalation.moderatorRoles || []).some(roleId => member.roles.cache.has(roleId))) {
        return replyError(message, "Cannot moderate this user (they are a configured moderator).");
      }
    } else {
      if (userObj.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
      if (userObj.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
    }
  }

  // Escalation thresholds
  const kickThreshold = typeof escalation.kickThreshold === "number" ? escalation.kickThreshold : 3;
  const muteThreshold = typeof escalation.muteThreshold === "number" ? escalation.muteThreshold : 2;
  const muteDuration = typeof escalation.muteDuration === "number" ? escalation.muteDuration : 2 * 60 * 60 * 1000;

  // Parse duration and reason from args (after user mention/user id)
  const argStart = message.mentions.members.size > 0 ? 1 : (args[0] && /^\d+$/.test(args[0]) ? 1 : 0);
  const { duration, reason } = parseDurationAndReason(args.slice(argStart));

  // Use default duration if not provided
  const finalDuration = duration || DEFAULT_MUTE;
  const finalReason = reason || "No reason provided";

  try {
    switch(command) {
      case "mute":
        if (!isTesting && (!member || !member.moderatable)) throw new Error("Cannot mute this person.");
        if (!isTesting) {
          await member.timeout(finalDuration, finalReason);
          if (!member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.add(MUTE_ROLE_ID).catch(() => {});
        }
        let muteLogMsg = await sendModLog(client, member, message.author, "muted", finalReason, true, formatDuration(finalDuration));
        if (isTesting && muteLogMsg && muteLogMsg.id) testLogMessageIds.push(muteLogMsg.id);
        await sendUserDM(member, "muted", formatDuration(finalDuration), finalReason);
        await replySuccess(message, `Muted ${member} for ${formatDuration(finalDuration)}${isTesting ? " (testing mode, will revert)" : ""}`);
        // If testing, schedule revert
        if (isTesting) {
          setTimeout(async () => {
            await member.timeout(null, "Testing mode revert").catch(() => {});
            await member.roles.remove(MUTE_ROLE_ID).catch(() => {});
          }, 5000); // Revert after 5 seconds (adjust as needed)
        }
        return;

      case "unmute":
        if (!member) throw new Error("Cannot unmute this person.");
        await member.timeout(null, `Unmuted by ${message.author.tag}`);
        if (member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.remove(MUTE_ROLE_ID).catch(() => {});
        await sendModLog(client, member, message.author, "unmuted", null, false);
        await sendUserDM(member, "unmuted");
        await replySuccess(message, `Unmuted ${member}`);
        return;

      case "warn":
        // Always use user ID for warnings
        const warnId = userObj.id;
        if (!Array.isArray(config.warnings[warnId])) config.warnings[warnId] = [];
        let warnings = config.warnings[warnId];
        warnings.push({ moderator: message.author.id, reason: finalReason, date: Date.now() });
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
          await sendUserDM(member, "warned", null, finalReason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        } else if (userObj) {
          await sendUserDM(userObj, "warned", null, finalReason, `Current warnings: ${warnings.length}${escalationMessage ? `\n${escalationMessage}` : ""}`);
        }
        let logMsg = await sendModLog(client, member || userObj, message.author, "warned", finalReason, true, null, warnings.length);
        if (isTesting && logMsg && logMsg.id) testLogMessageIds.push(logMsg.id);

        await replySuccess(
          message,
          `Warned <@${warnId}> for: **${finalReason}**${escalationMessage ? `\n${escalationMessage}` : ""}`
        );
        // If testing, remove the warning after a short delay
        if (isTesting) {
          setTimeout(() => {
            config.warnings[warnId].pop();
            saveConfig();
          }, 5000); // Revert after 5 seconds
        }
        return;
        
      case "removewarn": {
        // Always use user ID for warnings
        const warnId = userObj.id;
        if (!Array.isArray(config.warnings[warnId]) || config.warnings[warnId].length === 0) {
          return replyError(message, "This user has no warnings to remove.");
        }

        // Parse index argument (1-based), default to last warning
        let index = parseInt(reasonArgs[0], 10);
        if (isNaN(index) || index < 1 || index > config.warnings[warnId].length) {
          index = config.warnings[warnId].length; // Remove latest warning
        }

        const removed = config.warnings[warnId].splice(index - 1, 1)[0];
        saveConfig();

        await sendUserDM(member || userObj, "warning removed", null, removed.reason, `Current warnings: ${config.warnings[warnId].length}`);
        let logMsg = await sendModLog(client, member || userObj, message.author, "warning removed", removed.reason, true, null, config.warnings[warnId].length);
        if (isTesting && logMsg && logMsg.id) testLogMessageIds.push(logMsg.id);

        await replySuccess(message, `Removed warning #${index} from <@${warnId}>${removed.reason ? `: **${removed.reason}**` : ""}`);
        return;
      }

      case "kick":
        // Only check kickable if NOT in testing mode
        if (!isTesting && (!member || !member.kickable)) throw new Error("Cannot kick this person.");
        // Do NOT actually kick in testing mode
        if (!isTesting) {
          await member.kick(finalReason || `Kicked by ${message.author.tag}`);
        }
        let kickLogMsg = await sendModLog(client, member, message.author, "kicked", finalReason, true);
        if (isTesting && kickLogMsg && kickLogMsg.id) testLogMessageIds.push(kickLogMsg.id);
        await sendUserDM(member, "kicked", null, finalReason);
        await replySuccess(message, `Kicked ${member}${isTesting ? " (testing mode, not actually kicked)" : ""}`);
        return;

      case "ban":
        // Only check bannable if NOT in testing mode
        if (!isTesting && (!member || !member.bannable)) throw new Error("Cannot ban this person.");

        // Ban duration logic
        let banDuration = finalDuration;
        let banReason = finalReason;

        // Do NOT actually ban in testing mode
        if (!isTesting) {
          await member.ban({ reason: banReason });
          // If a duration is provided, schedule unban
          if (banDuration && banDuration > 0) {
            setTimeout(async () => {
              await message.guild.members.unban(member.id, "Temporary ban expired").catch(() => {});
            }, banDuration);
          }
        }
        let banLogMsg = await sendModLog(client, member, message.author, "banned", banReason, true, banDuration ? formatDuration(banDuration) : null);
        if (isTesting && banLogMsg && banLogMsg.id) testLogMessageIds.push(banLogMsg.id);
        await sendUserDM(member, "banned", banDuration ? formatDuration(banDuration) : null, banReason);
        await replySuccess(message, `Banned ${member}${banDuration ? ` for ${formatDuration(banDuration)}` : ""}${isTesting ? " (testing mode, not actually banned)" : ""}`);
        return;
    }
  } catch (err) {
    console.error(`[Moderation Command Error] ${command}:`, err);
    await replyError(message, `An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
  }
}

module.exports = {
  handleModerationCommands
};