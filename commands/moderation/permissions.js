const { config } = require("../../utils/storage");
const { getCached, setCached } = require('../../utils/permissionsCache');
const { PermissionFlagsBits } = require("discord.js");

const OWNER_ID = process.env.OWNER_ID || "349282473085239298";

// Staff roles
const STAFF_MANAGER_ROLE = "1380277718091829368";
const STAFF_SECURITY_ROLE = "1380323145621180466";
const STAFF_MODERATOR_ROLE = "1375958589658632313";
const STAFF_STAFF_ROLE = "1375958480380493844";
const STAFF_ADMIN_ROLE = "1381077407074750594";

const ALLOWED_ROLES = [
  STAFF_MANAGER_ROLE,
  STAFF_SECURITY_ROLE,
  STAFF_MODERATOR_ROLE,
  STAFF_STAFF_ROLE,
  STAFF_ADMIN_ROLE
];

const CHATBOX_BUTTON_ID = "staffteam_chatbox";

function isModerator(member) {
  if (!member) return false;
  const cached = getCached(member.guild?.id || 'global', member.id);
  if (cached !== null) return cached;
  if (String(member.id) === String(OWNER_ID)) { setCached(member.guild?.id || 'global', member.id, true); return true; }

  const roleCache = member.roles?.cache || new Map();
  const hasRole = (rid) => roleCache.has(rid);
  const configured = Array.isArray(config.moderatorRoles) ? config.moderatorRoles : [];
  if (configured.some(hasRole)) { setCached(member.guild?.id || 'global', member.id, true); return true; }
  if (ALLOWED_ROLES.some(hasRole)) { setCached(member.guild?.id || 'global', member.id, true); return true; }

  if (member.permissions && typeof member.permissions.has === "function") {
    if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      setCached(member.guild?.id || 'global', member.id, true);
      return true;
    }
  }
  setCached(member.guild?.id || 'global', member.id, false);
  return false;
}

module.exports = {
  OWNER_ID,
  STAFF_MANAGER_ROLE,
  STAFF_SECURITY_ROLE,
  STAFF_MODERATOR_ROLE,
  STAFF_STAFF_ROLE,
  STAFF_ADMIN_ROLE,
  ALLOWED_ROLES,
  CHATBOX_BUTTON_ID,
  isModerator
};