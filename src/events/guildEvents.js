const { logMemberLeave } = require("../utils/memberLogs");
const { logRoleChange } = require("../utils/roleLogs");
const { logMessageDelete, logMessageEdit } = require("../utils/messageLogs");
const { handleMessageDelete: handleSnipeDelete } = require("../commands/snipes");

function attachGuildEvents(client) {
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

	// Message delete/edit logs + snipes
	client.on("messageDelete", async (message) => {
		try { await logMessageDelete(client, message); } catch (err) { console.error("[messageDelete] log error:", err); }
		try { handleSnipeDelete(message); } catch (err) { console.error("[messageDelete] snipe error:", err); }
		// Prune clock-in positions when a tracked auto/clock-in message is deleted
		try {
			const { getEvents } = require('../utils/eventsStorage');
			const { pruneClockInForEvent } = require('../utils/clockinPrune');
			const events = getEvents();
			if (Array.isArray(events) && events.length) {
				for (const ev of events) {
					try {
						let matched = false;
						if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds) && ev.__clockIn.messageIds.includes(message.id)) matched = true;
						if (!matched && ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
							for (const rec of Object.values(ev.__notifMsgs)) {
								if (rec && Array.isArray(rec.ids) && rec.ids.includes(message.id)) { matched = true; break; }
							}
						}
						if (!matched) continue;
						pruneClockInForEvent(ev.id, { clearConsumedAutoNext: true });
					} catch (e) {
						// ignore per-event errors
					}
				}
			}
		} catch (e) {
			console.error('[messageDelete] clock-in prune error', e && e.message ? e.message : e);
		}
	});
	client.on("messageUpdate", async (oldMessage, newMessage) => {
		try { await logMessageEdit(client, oldMessage, newMessage); } catch (err) { console.error("[messageUpdate] log error:", err); }
	});
}

module.exports = { attachGuildEvents };
