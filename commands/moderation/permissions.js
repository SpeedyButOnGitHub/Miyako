import { config } from "../../utils/storage.js";

export const OWNER_ID = process.env.OWNER_ID || "349282473085239298";

// Staff roles
export const STAFF_MANAGER_ROLE = "1380277718091829368";
export const STAFF_SECURITY_ROLE = "1380323145621180466";
export const STAFF_MODERATOR_ROLE = "1375958589658632313";
export const STAFF_STAFF_ROLE = "1375958480380493844";
export const STAFF_ADMIN_ROLE = "1381077407074750594";

export const ALLOWED_ROLES = [
  STAFF_MANAGER_ROLE,
  STAFF_SECURITY_ROLE,
  STAFF_MODERATOR_ROLE,
  STAFF_STAFF_ROLE,
  STAFF_ADMIN_ROLE
];

export const CHATBOX_BUTTON_ID = "staffteam_chatbox";

export function isModerator(member) {
  if (!member) return false;
  return config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)) || member.id === OWNER_ID;
}