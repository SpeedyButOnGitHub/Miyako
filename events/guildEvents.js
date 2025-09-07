const { logMemberLeave } = require("../utils/memberLogs");
const { logRoleChange } = require("../utils/roleLogs");
const { logMessageDelete, logMessageEdit } = require("../utils/messageLogs");
const { handleMessageDelete: handleSnipeDelete } = require("../commands/snipes");

module.exports = function(client) {
  // Member leaves
  client.on("guildMemberRemove", async (member) => {
    try {
      await logMemberLeave(client, member, false);
    } catch (err) {
      console.error("[guildMemberRemove] log error:", err);
    }
  });

  // Role add/remove
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      const oldRoles = new Set(oldMember.roles.cache.keys());
      const newRoles = new Set(newMember.roles.cache.keys());

      // Added roles
      for (const roleId of newRoles) {
        if (!oldRoles.has(roleId)) {
          const role = newMember.guild.roles.cache.get(roleId);
          if (role) await logRoleChange(client, newMember, role, "add");
        }
      }
      // Removed roles
      for (const roleId of oldRoles) {
        if (!newRoles.has(roleId)) {
          const role = newMember.guild.roles.cache.get(roleId);
          if (role) await logRoleChange(client, newMember, role, "remove");
        }
      }
    } catch (err) {
      console.error("[guildMemberUpdate] role log error:", err);
    }
  });

  // Message delete/edit logs
  client.on("messageDelete", async (message) => {
    try { await logMessageDelete(client, message); } catch (err) { console.error("[messageDelete] log error:", err); }
    try { handleSnipeDelete(message); } catch (err) { console.error("[messageDelete] snipe error:", err); }
  });
  client.on("messageUpdate", async (oldMessage, newMessage) => {
    try { await logMessageEdit(client, oldMessage, newMessage); } catch (err) { console.error("[messageUpdate] log error:", err); }
  });
};
