const { config } = require("../../utils/storage");
const OWNER_ID = process.env.OWNER_ID || "349282473085239298";

function isModerator(member) {
  return config.moderatorRoles.some(roleId => member.roles.cache.has(roleId)) || member.id === OWNER_ID;
}

module.exports = { isModerator, OWNER_ID };