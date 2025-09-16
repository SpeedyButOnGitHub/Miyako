const { logMemberLeave } = require('../utils/memberLogs');
const { logRoleChange } = require('../utils/roleLogs');
const { logMessageDelete, logMessageEdit } = require('../utils/messageLogs');
const { handleMessageDelete: handleSnipeDelete } = require('../commands/snipes');
const { updateStaffMessage } = require('../utils/staffTeam');
const { config } = require('../utils/storage');
const rolesConfig = require('../../config/roles');

// Debounce map to coalesce frequent staff updates per guild (ms)
const staffUpdateTimers = new Map();
const STAFF_UPDATE_DEBOUNCE_MS = 5000; // 5s debounce

const logger = require('../utils/logger');

function attachGuildEvents(client) {
	// Member leaves
	client.on('guildMemberRemove', async (member) => {
		try {
			await logMemberLeave(client, member, false);
		} catch (err) {
			console.error('[guildMemberRemove] log error:', err);
		}
	});

	// Member joins: assign autoroles
	client.on('guildMemberAdd', async (member) => {
		try {
			// If configured, assign bot-only autorole to bots
			if (member.user && member.user.bot) {
				const botRole = config.autoRolesBot || null;
				if (botRole) {
					try {
						await member.roles.add(botRole);
					} catch (e) {
						try {
							logger.warn('[guildMemberAdd] failed to add bot autorole', {
								guildId: member.guild.id,
								userId: member.id,
								roleId: botRole,
								err: e && e.message,
							});
						} catch {}
					}
				}
			}
			// Assign configured autoroles to regular members
			const auto = Array.isArray(config.autoRoles) ? config.autoRoles.slice() : [];
			if (auto && auto.length && !(member.user && member.user.bot)) {
				try {
					await member.roles.add(auto);
				} catch (e) {
					try {
						logger.warn('[guildMemberAdd] failed to add autoroles', {
							guildId: member.guild.id,
							userId: member.id,
							roles: auto,
							err: e && e.message,
						});
					} catch {}
				}
			}
			// After assignment, schedule an update to the Staff Team message (debounced)
			try {
				const gid = member.guild.id;
				if (staffUpdateTimers.has(gid)) clearTimeout(staffUpdateTimers.get(gid));
				staffUpdateTimers.set(
					gid,
					setTimeout(async () => {
						staffUpdateTimers.delete(gid);
						try {
							await updateStaffMessage(member.guild);
						} catch (e) {
							try {
								logger.warn('[updateStaffMessage] debounced update failed', {
									guildId: gid,
									err: e && e.message,
								});
							} catch {}
						}
					}, STAFF_UPDATE_DEBOUNCE_MS),
				);
			} catch (e) {
				try {
					logger.warn('[guildMemberAdd] schedule staff update failed', {
						guildId: member.guild.id,
						err: e && e.message,
					});
				} catch {}
			}
		} catch (err) {
			console.error('[guildMemberAdd] autorole error:', err && err.message ? err.message : err);
		}
	});

	// Role add/remove
	client.on('guildMemberUpdate', async (oldMember, newMember) => {
		try {
			const oldRoles = new Set(oldMember.roles.cache.keys());
			const newRoles = new Set(newMember.roles.cache.keys());

			// Determine whether any of the tracked staff roles changed
			let staffRoleChanged = false;
			try {
				const tracked = Object.values(rolesConfig.ROLES || {});
				for (const r of tracked) {
					if (oldRoles.has(r) !== newRoles.has(r)) {
						staffRoleChanged = true;
						break;
					}
				}
			} catch {}

			// Added roles
			for (const roleId of newRoles) {
				if (!oldRoles.has(roleId)) {
					const role = newMember.guild.roles.cache.get(roleId);
					if (role) await logRoleChange(client, newMember, role, 'add');
				}
			}
			// Removed roles
			for (const roleId of oldRoles) {
				if (!newRoles.has(roleId)) {
					const role = newMember.guild.roles.cache.get(roleId);
					if (role) await logRoleChange(client, newMember, role, 'remove');
				}
			}

			// If any staff role changed, update the staff message
			if (staffRoleChanged) {
				try {
					const gid = newMember.guild.id;
					if (staffUpdateTimers.has(gid)) clearTimeout(staffUpdateTimers.get(gid));
					staffUpdateTimers.set(
						gid,
						setTimeout(async () => {
							staffUpdateTimers.delete(gid);
							try {
								await updateStaffMessage(newMember.guild);
							} catch (e) {
								try {
									logger.warn('[updateStaffMessage] debounced update failed', {
										guildId: gid,
										err: e && e.message,
									});
								} catch {}
							}
						}, STAFF_UPDATE_DEBOUNCE_MS),
					);
				} catch (e) {
					try {
						logger.warn('[guildMemberUpdate] schedule staff update failed', {
							guildId: newMember.guild.id,
							err: e && e.message,
						});
					} catch {}
				}
			}
		} catch (err) {
			console.error('[guildMemberUpdate] role log error:', err);
		}
	});

	// Message delete/edit logs + snipes
	client.on('messageDelete', async (message) => {
		try {
			await logMessageDelete(client, message);
		} catch (err) {
			console.error('[messageDelete] log error:', err);
		}
		try {
			handleSnipeDelete(message);
		} catch (err) {
			console.error('[messageDelete] snipe error:', err);
		}
		// Prune clock-in positions when a tracked auto/clock-in message is deleted
		try {
			const { getEvents } = require('../utils/eventsStorage');
			const { pruneClockInForEvent } = require('../utils/clockinPrune');
			const events = getEvents();
			if (Array.isArray(events) && events.length) {
				for (const ev of events) {
					try {
						let matched = false;
						if (
							ev.__clockIn &&
							Array.isArray(ev.__clockIn.messageIds) &&
							ev.__clockIn.messageIds.includes(message.id)
						)
							matched = true;
						if (!matched && ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
							for (const rec of Object.values(ev.__notifMsgs)) {
								if (rec && Array.isArray(rec.ids) && rec.ids.includes(message.id)) {
									matched = true;
									break;
								}
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
	client.on('messageUpdate', async (oldMessage, newMessage) => {
		try {
			await logMessageEdit(client, oldMessage, newMessage);
		} catch (err) {
			console.error('[messageUpdate] log error:', err);
		}
	});
}

module.exports = { attachGuildEvents };
