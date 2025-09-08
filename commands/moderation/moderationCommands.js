const { sendModLog } = require("../../utils/modLogs");
const { replySuccess, replyError } = require("./replies");
const { sendUserDM } = require("./dm");
const { isModerator } = require("./permissions");
const { config, saveConfig } = require("../../utils/storage");
const ms = require("ms");
const { parseDurationAndReason } = require("../../utils/time");

const OWNER_ID = process.env.OWNER_ID || "349282473085239298";
const MUTE_ROLE_ID = "1391535514901020744";
const DEFAULT_MUTE = config.defaultMuteDuration || 60 * 60 * 1000;

function formatDuration(duration) {
  return ms(duration, { long: true });
}

async function findTarget(message, args) {
  let target = null;
  let reasonArgs = args;

  if (message.mentions.members.size > 0) {
    target = message.mentions.members.first();
    reasonArgs = args.slice(1);
  } else if (args[0]) {
    target = await message.guild.members.fetch(args[0]).catch(() => null);
    if (target) reasonArgs = args.slice(1);
  }
  if (!target && args[0]) {
    const search = args[0].toLowerCase();
    target = message.guild.members.cache.find(
      m =>
        m.user.username.toLowerCase() === search ||
        (m.nickname && m.nickname.toLowerCase() === search)
    );
    if (target) reasonArgs = args.slice(1);
  }

  let user = null;
  if (!target && args[0]) {
    user = await message.client.users.fetch(args[0]).catch(() => null);
    if (user) reasonArgs = args.slice(1);
  }

  return { target, user, reasonArgs };
}

async function tryTimeoutOrRoleMute(member, durationMs, reason) {
  // Prefer Discord timeout
  if (member && typeof member.timeout === "function") {
    try {
      await member.timeout(Math.min(durationMs, 14 * 24 * 60 * 60 * 1000), reason || "Muted");
      return true;
    } catch {}
  }
  // Fallback to mute role if present
  try {
    if (MUTE_ROLE_ID && member.guild.roles.cache.has(MUTE_ROLE_ID)) {
      if (!member.roles.cache.has(MUTE_ROLE_ID)) {
        await member.roles.add(MUTE_ROLE_ID, reason || "Muted");
      }
      return true;
    }
  } catch {}
  return false;
}

async function clearTimeoutAndRole(member, reason) {
  try { if (typeof member.timeout === "function") await member.timeout(null, reason || "Unmuted"); } catch {}
  try { if (MUTE_ROLE_ID && member.roles.cache.has(MUTE_ROLE_ID)) await member.roles.remove(MUTE_ROLE_ID, reason || "Unmuted"); } catch {}
}

async function handleModerationCommands(client, message, command, args) {
  if (!isModerator(message.member)) return replyError(message, "You are not allowed to use this command.");

  const { target, user, reasonArgs } = await findTarget(message, args);
  if (!target && !user) return replyError(message, "You must mention a user, provide a valid user ID, or type their username/nickname.");

  const member = target;
  const userObj = member ? member.user : user;

  const isTesting = !!config.testingMode;
  const escalation = config.escalation || {};
  // Enforce requested thresholds (mute=3, kick=5) with config override if provided
  const muteThreshold = Number.isFinite(escalation.muteThreshold) ? escalation.muteThreshold : 3;
  const kickThreshold = Number.isFinite(escalation.kickThreshold) ? escalation.kickThreshold : 5;
  const muteDurationMs = Number.isFinite(escalation.muteDuration) ? escalation.muteDuration : 2 * 60 * 60 * 1000;

  // Restriction checks (skip in testing to avoid noise)
  if (!isTesting) {
    if (member) {
      if (member.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
      if (member.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
      if (member.roles.highest.comparePositionTo(message.member.roles.highest) >= 0 && message.author.id !== OWNER_ID)
        return replyError(message, "You cannot moderate this user due to role hierarchy.");
      if ((config.moderatorRoles || []).some(r => member.roles.cache.has(r))) {
        return replyError(message, "Cannot moderate this user (they are a configured moderator).");
      }
    } else {
      if (userObj.id === message.author.id) return replyError(message, "You cannot moderate yourself.");
      if (userObj.id === OWNER_ID) return replyError(message, "You cannot moderate the owner.");
    }
  }

  // Parse duration and reason after target
  const argOffset = message.mentions.members.size > 0 ? 1 : (args[0] && /^\d{5,}$/.test(args[0]) ? 1 : 0);
  const { duration, reason } = parseDurationAndReason(args.slice(argOffset));
  const finalDuration = duration || DEFAULT_MUTE;
  const finalReason = reason || "No reason provided";

  try {
    switch (command) {
      case "mute": {
        if (!member) return replyError(message, "User is not in this server.");
        if (!isTesting) {
          const ok = await tryTimeoutOrRoleMute(member, finalDuration, `${finalReason} • by ${message.author.tag}`);
          if (!ok) return replyError(message, "Failed to mute this user. Do I have permissions?");
        }
        await sendUserDM(member, "muted", formatDuration(finalDuration), finalReason);
        await sendModLog(client, member, message.author, "muted", finalReason, true, formatDuration(finalDuration), null);
        await replySuccess(message, `Muted ${member} for ${formatDuration(finalDuration)}${isTesting ? " (testing mode, not applied)" : ""}`);
        return;
      }

      case "unmute": {
        if (!member) return replyError(message, "User is not in this server.");
        if (!isTesting) await clearTimeoutAndRole(member, `Unmuted by ${message.author.tag}`);
        await sendUserDM(member, "unmuted");
        await sendModLog(client, member, message.author, "unmuted", null, false, null, null);
        await replySuccess(message, `Unmuted ${member}`);
        return;
      }

      case "warn": {
        const warnId = userObj.id;
        if (!Array.isArray(config.warnings[warnId])) config.warnings[warnId] = [];
        const warnings = config.warnings[warnId];

        const entry = { moderator: message.author.id, reason: finalReason, date: Date.now(), logMsgId: null };
        warnings.push(entry);
        saveConfig();

        const newCount = warnings.length;

        // Determine escalation (single combined flow; no public escalation message)
        let escalationNote = null;
        let escalationDurationText = null;

        if (newCount >= kickThreshold) {
          escalationNote = `Auto-kick threshold reached (${newCount}/${kickThreshold}).`;
          if (!isTesting && member && member.kickable) {
            try { await member.kick(finalReason); } catch {}
          }
          // DM only (no public)
          await sendUserDM(member || userObj, "kicked", null, finalReason, `You reached ${newCount} warnings.`);
        } else if (newCount >= muteThreshold) {
          escalationNote = `Auto-mute threshold reached (${newCount}/${muteThreshold}).`;
          escalationDurationText = formatDuration(muteDurationMs);
          if (!isTesting && member) {
            await tryTimeoutOrRoleMute(member, muteDurationMs, `${finalReason} • Auto-mute`);
          }
          await sendUserDM(member || userObj, "muted", escalationDurationText, finalReason, `You reached ${newCount} warnings.`);
        }

        const remainingToMute = Math.max(0, muteThreshold - newCount);
        const remainingToKick = Math.max(0, kickThreshold - newCount);
        const remainingLine = `Warnings until actions: ${remainingToMute} to auto-mute, ${remainingToKick} to auto-kick.`;

        await sendUserDM(
          member || userObj,
          "warned",
          escalationDurationText,
          finalReason,
          `Current warnings: ${newCount}\n${remainingLine}${escalationNote ? `\n${escalationNote}` : ""}`
        );

        const combinedReason = `${finalReason} • ${remainingLine}${escalationNote ? ` • ${escalationNote}` : ""}`;
        const logMsg = await sendModLog(
          client,
          member || userObj,
          message.author,
          "warned",
          combinedReason,
          true,
          escalationDurationText,
          newCount
        );
        if (logMsg) {
          entry.logMsgId = logMsg.id;
          saveConfig();
        }

        await replySuccess(message, `Warned <@${warnId}> for: **${finalReason}**`);
        return;
      }

      case "removewarn": {
        const warnId = userObj.id;
        if (!Array.isArray(config.warnings[warnId]) || config.warnings[warnId].length === 0) {
          return replyError(message, "This user has no warnings.");
        }
        let index = parseInt(reasonArgs[0], 10);
        if (isNaN(index) || index < 1 || index > config.warnings[warnId].length) {
          index = config.warnings[warnId].length; // default last
        }
        const removed = config.warnings[warnId].splice(index - 1, 1)[0];
        saveConfig();

        const count = config.warnings[warnId].length;
        const remainingToMute2 = Math.max(0, muteThreshold - count);
        const remainingToKick2 = Math.max(0, kickThreshold - count);
        const remainingLine2 = `Warnings until actions: ${remainingToMute2} to auto-mute, ${remainingToKick2} to auto-kick.`;

        await sendUserDM(member || userObj, "warning removed", null, removed?.reason || "No reason", `Current warnings: ${count}\n${remainingLine2}`);
        await sendModLog(client, member || userObj, message.author, "warning removed", `${removed?.reason || "No reason"} • ${remainingLine2}`, true, null, count);
        await replySuccess(message, `Removed warning #${index} from <@${warnId}>${removed?.reason ? `: **${removed.reason}**` : ""}`);
        return;
      }

      case "kick": {
        if (!member) return replyError(message, "User is not in this server.");
        if (!isTesting && !member.kickable) return replyError(message, "I cannot kick this user.");
        if (!isTesting) {
          try { await member.kick(finalReason); } catch { return replyError(message, "Failed to kick this user."); }
        }
        await sendUserDM(member, "kicked", null, finalReason);
        await sendModLog(client, member, message.author, "kicked", finalReason, true, null, null);
        await replySuccess(message, `Kicked ${member}${isTesting ? " (testing mode, not actually kicked)" : ""}`);
        return;
      }

      case "ban": {
        if (!member) return replyError(message, "User is not in this server.");
        if (!isTesting && !member.bannable) return replyError(message, "I cannot ban this user.");
        if (!isTesting) {
          try { await member.ban({ reason: finalReason }); } catch { return replyError(message, "Failed to ban this user."); }
        }
        await sendUserDM(member, "banned", null, finalReason);
        await sendModLog(client, member, message.author, "banned", finalReason, true, null, null);
        await replySuccess(message, `Banned ${member}${isTesting ? " (testing mode, not actually banned)" : ""}`);
        return;
      }

      default:
        return replyError(message, "Unknown moderation command.");
    }
  } catch (err) {
    console.error(`[Moderation Command Error] ${command}:`, err);
    await replyError(message, `An error occurred while executing \`${command}\`.\nDetails: \`${err.message || err}\``);
  }
}

module.exports = {
  handleModerationCommands
};