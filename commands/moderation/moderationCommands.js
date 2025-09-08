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

// --- Warnings store helpers (testing-mode aware) ---
function ensureStores() {
  if (typeof config.warnings !== "object" || !config.warnings) config.warnings = {};
  if (typeof config.testingWarnings !== "object" || !config.testingWarnings) config.testingWarnings = {};
}
function getStore() {
  return config.testingMode ? config.testingWarnings : config.warnings;
}
function getUserWarnings(userId) {
  ensureStores();
  const store = getStore();
  return Array.isArray(store[userId]) ? store[userId] : [];
}
function setUserWarnings(userId, arr) {
  ensureStores();
  const store = getStore();
  store[userId] = Array.isArray(arr) ? arr : [];
  saveConfig();
}
function getThresholds() {
  const esc = config.escalation || {};
  const muteT = Math.max(1, Number(esc.muteThreshold || 3));
  const kickT = Math.max(muteT + 1, Number(esc.kickThreshold || 5));
  return { muteT, kickT, muteDurationMs: Number.isFinite(esc.muteDuration) ? esc.muteDuration : 2 * 60 * 60 * 1000 };
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
        const warnings = getUserWarnings(warnId);
        const entry = { moderator: message.author.id, reason: finalReason, date: Date.now(), logMsgId: null };
        warnings.push(entry);
        setUserWarnings(warnId, warnings);

        const newCount = warnings.length;

        // Determine escalation (single combined flow; no public escalation message)
        let escalationNote = null;
        let escalationDurationText = null;

        const { muteT, kickT, muteDurationMs: mMs } = getThresholds();
        if (newCount >= kickT) {
          escalationNote = `Due to reaching ${newCount} warnings, you have been kicked.`;
          if (!isTesting && member && member.kickable) {
            try { await member.kick(finalReason); } catch {}
          }
          // Single DM covering warn + punishment
          await sendUserDM(member || userObj, "warned", null, finalReason, `Due to reaching ${newCount} warnings, you have been kicked.`);
        } else if (newCount >= muteT) {
          escalationNote = `Due to reaching ${newCount} warnings, you have been muted.`;
          escalationDurationText = formatDuration(mMs);
          if (!isTesting && member) {
            await tryTimeoutOrRoleMute(member, mMs, `${finalReason} • Auto-mute`);
          }
          await sendUserDM(member || userObj, "warned", escalationDurationText, finalReason, `Due to reaching ${newCount} warnings, you have been muted.`);
        }

        const remainingToMute = Math.max(0, muteT - newCount);
        const remainingToKick = Math.max(0, kickT - newCount);
  // Dynamic next punishment
  let remainingLine = null;
  if (newCount < muteT) remainingLine = `${muteT - newCount} warning${muteT - newCount === 1 ? "" : "s"} remaining until mute`;
  else if (newCount < kickT) remainingLine = `${kickT - newCount} warning${kickT - newCount === 1 ? "" : "s"} remaining until kick`;

        await sendUserDM(
          member || userObj,
          "warned",
          escalationDurationText,
          finalReason,
          `${remainingLine ? remainingLine + "\n" : ""}${escalationNote ? escalationNote : ""}`.trim()
        );

  // Build log reason without an explicit "warnings remaining" line; modLogs will place remaining in footer when applicable
  const combinedReason = `${finalReason}${escalationNote ? `\n\n${escalationNote}` : ""}`;
  const nxtRemain = remainingLine ? parseInt((remainingLine.match(/^(\d+)/) || [0,0])[1], 10) || 0 : 0;
        const logMsg = await sendModLog(
          client,
          member || userObj,
          message.author,
          "warned",
          combinedReason,
          true,
          escalationDurationText,
          nxtRemain
        );
        if (logMsg) {
          entry.logMsgId = logMsg.id;
          saveConfig();
        }

  await replySuccess(message, `Warned <@${warnId}> for: **${finalReason}**${remainingLine ? `\n${remainingLine}` : ""}`);
        return;
      }

      case "removewarn": {
        const warnId = userObj.id;
        const warnings = getUserWarnings(warnId);
        if (!Array.isArray(warnings) || warnings.length === 0) {
          return replyError(message, "This user has no warnings.");
        }
        let index = parseInt(reasonArgs[0], 10);
        if (isNaN(index) || index < 1 || index > warnings.length) {
          index = warnings.length; // default last
        }
        const removed = warnings.splice(index - 1, 1)[0];
        setUserWarnings(warnId, warnings);

    const count = warnings.length;
    const { muteT, kickT } = getThresholds();
    let remainingLine2 = null;
    if (count < muteT) remainingLine2 = `${muteT - count} warning${muteT - count === 1 ? "" : "s"} remaining until mute`;
    else if (count < kickT) remainingLine2 = `${kickT - count} warning${kickT - count === 1 ? "" : "s"} remaining until kick`;

    const nxtRemain2 = remainingLine2 ? parseInt((remainingLine2.match(/^(\d+)/) || [0,0])[1], 10) || 0 : 0;
  await sendUserDM(member || userObj, "warning removed", null, removed?.reason || "No reason", null);
  // Include remaining line in reason so the logger can move it to the footer
  const reasonForLog = remainingLine2 ? `${removed?.reason || "No reason"}\n\n${remainingLine2}` : `${removed?.reason || "No reason"}`;
  await sendModLog(client, member || userObj, message.author, "warning removed", reasonForLog, true, null, nxtRemain2);
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