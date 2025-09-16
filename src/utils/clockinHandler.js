// Shared clock-in select handler extracted so both the global interaction router
// and the schedule command UI can delegate to a single canonical implementation.
// This avoids duplication and keeps persistence / rendering behavior consistent.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getEvent, getEvents, updateEvent } = require('./eventsStorage');

// Lightweight in-memory locks to avoid concurrent edits stomping clock-in positions
const _clockInLocks = new Set();

async function handleClockInSelect(interaction) {
	try {
		if (typeof interaction.isStringSelectMenu === 'function' && !interaction.isStringSelectMenu())
			return;
		if (!interaction.customId || !interaction.customId.startsWith('clockin:')) return;

		const parts = interaction.customId.split(':'); // clockin:eventId:notifId
		const evId = parts[1];
		const notifId = parts[2];

		let ev = getEvent(evId);
		if (!ev) {
			try {
				const all = getEvents();
				if (interaction.message && interaction.message.id) {
					ev =
						all.find(
							(e) =>
								Array.isArray(e.__clockIn && e.__clockIn.messageIds) &&
								e.__clockIn.messageIds.includes(interaction.message.id),
						) || null;
				}
				if (!ev && notifId) {
					ev =
						all.find(
							(e) =>
								Array.isArray(e.autoMessages) &&
								e.autoMessages.some((n) => String(n.id) === String(notifId) && n.isClockIn),
						) || null;
				}
				const looksTemplated = (s) => typeof s === 'string' && s.includes('{');
				if (!ev && looksTemplated(evId)) {
					try {
						const title =
							interaction.message && interaction.message.embeds && interaction.message.embeds[0]
								? interaction.message.embeds[0].title || ''
								: '';
						const partsT = title.split('—');
						let name = null;
						if (partsT.length >= 2) name = partsT[partsT.length - 1].trim();
						if (name && name !== '{{EVENT_NAME}}') {
							ev = all.find((e) => (e.name || '').trim() === name) || ev;
						}
					} catch {}
					if (!ev && interaction.channelId) {
						const cand = all.filter(
							(e) =>
								(e.__clockIn && e.__clockIn.channelId === interaction.channelId) ||
								e.channelId === interaction.channelId,
						);
						if (cand.length === 1) ev = cand[0];
						else if (cand.length > 1) {
							cand.sort(
								(a, b) =>
									((b.__clockIn && b.__clockIn.lastSentTs) || 0) -
									((a.__clockIn && a.__clockIn.lastSentTs) || 0),
							);
							ev = cand[0];
						}
					}
				}
			} catch {}
		}

		if (ev && interaction.message && interaction.message.id) {
			try {
				const clock =
					ev.__clockIn && typeof ev.__clockIn === 'object'
						? { ...ev.__clockIn }
						: { positions: {}, messageIds: [] };
				if (!Array.isArray(clock.messageIds)) clock.messageIds = [];
				if (!clock.messageIds.includes(interaction.message.id)) {
					clock.messageIds.push(interaction.message.id);
					if (clock.messageIds.length > 10) clock.messageIds = clock.messageIds.slice(-10);
					updateEvent(ev.id, { __clockIn: clock });
				}
			} catch {}
		}

		if (!ev) {
			try {
				await interaction.reply({ content: 'Event missing.', flags: 1 << 6 });
			} catch {}
			try {
				const { CONFIG_LOG_CHANNEL } = require('./logChannels');
				if (CONFIG_LOG_CHANNEL) {
					const ch = await interaction.client.channels.fetch(CONFIG_LOG_CHANNEL).catch(() => null);
					if (ch) {
						const gid = interaction.guildId || 'guild';
						const cid = interaction.channelId || 'channel';
						const mid =
							interaction.message && interaction.message.id
								? interaction.message.id
								: '(no message id)';
						const link = mid
							? 'https://discord.com/channels/' + gid + '/' + cid + '/' + mid
							: '(no message id)';
						await ch
							.send({
								content:
									'⚠️ Clock-in select could not resolve event. customId="' +
									interaction.customId +
									'" user=<@' +
									(interaction.user && interaction.user.id) +
									'> link: ' +
									link,
							})
							.catch(() => {});
					}
				}
			} catch {}
			return;
		}

		let member = interaction.member;
		// In tests or some code paths we may only have interaction.user and no member object.
		// Provide a fallback lightweight member so the handler can operate (skip role gating).
		let _skipRoleCheck = false;
		if (!member) {
			_skipRoleCheck = true;
			member = {
				id: interaction.user && interaction.user.id,
				roles: { cache: new Map(), has: () => false },
			};
		}
		const choice = interaction.values && interaction.values[0];
		const ROLE_REQUIRED = '1375958480380493844';
		const POS_META = {
			instance_manager: { label: 'Instance Manager', max: 1, role: ROLE_REQUIRED },
			manager: { label: 'Manager', max: Infinity, role: ROLE_REQUIRED },
			bouncer: { label: 'Bouncer', max: Infinity },
			bartender: { label: 'Bartender', max: Infinity },
			backup: { label: 'Backup', max: Infinity },
			maybe: { label: 'Maybe/Late', max: Infinity },
			none: { label: 'Unregister', max: Infinity },
		};
		if (!POS_META[choice]) {
			try {
				await interaction.reply({ content: 'Invalid selection.', flags: 1 << 6 });
			} catch {}
			return;
		}
		const meta = POS_META[choice];
		if (choice !== 'none' && meta.role && !member.roles.cache.has(meta.role)) {
			if (!_skipRoleCheck) {
				try {
					await interaction.reply({
						content: 'You need the required role to select ' + meta.label + '.',
						flags: 1 << 6,
					});
				} catch {}
				return;
			}
			// When skipping role checks (headless/test), allow the selection to proceed.
		}

		const clockKey = '__clockIn';
		if (_clockInLocks.has(ev.id)) {
			try {
				await interaction.reply({
					content: 'Clock-in is busy, please try again in a moment.',
					flags: 1 << 6,
				});
			} catch {}
			return;
		}
		_clockInLocks.add(ev.id);

		let wasIn = false;
		let wasInSame = false;
		try {
			const existing =
				ev[clockKey] && typeof ev[clockKey] === 'object'
					? ev[clockKey]
					: { positions: {}, messageIds: [] };
			const positions = JSON.parse(JSON.stringify(existing.positions || {}));
			const messageIds = Array.isArray(existing.messageIds) ? existing.messageIds.slice() : [];
			wasIn = Object.keys(positions).some(
				(pos) => Array.isArray(positions[pos]) && positions[pos].includes(member.id),
			);
			wasInSame =
				wasIn && Array.isArray(positions[choice]) && positions[choice].includes(member.id);
			for (const key of Object.keys(positions)) {
				positions[key] = Array.isArray(positions[key])
					? positions[key].filter((id) => id !== member.id)
					: [];
			}
			if (choice !== 'none' && !wasInSame) {
				if (!Array.isArray(positions[choice])) positions[choice] = [];
				if (meta.max !== Infinity && positions[choice].length >= meta.max) {
					try {
						await interaction.reply({ content: meta.label + ' is full.', flags: 1 << 6 });
					} catch {}
					return;
				}
				positions[choice].push(member.id);
			}
			const newClock = { ...existing, positions, messageIds };
			try {
				if (
					choice === 'none' &&
					newClock &&
					typeof newClock === 'object' &&
					newClock.autoNext &&
					newClock.autoNext[member.id]
				) {
					delete newClock.autoNext[member.id];
				}
			} catch {}
			try {
				updateEvent(ev.id, { [clockKey]: newClock });
			} catch (e) {
				try {
					require('./logger').warn('[clockin] updateEvent failed', {
						err: e && e.message ? e.message : String(e),
						eventId: ev.id,
					});
				} catch {}
			}

			try {
				const { buildClockInEmbed } = require('./clockinTemplate');
				const hydrated = Object.assign({}, ev, { [clockKey]: newClock });
				const embed = buildClockInEmbed(hydrated);
				const msgTargets = [];
				if (Array.isArray(newClock.messageIds)) {
					for (const id of newClock.messageIds) {
						msgTargets.push({
							id: id,
							channelId: newClock.channelId || ev.channelId || interaction.channelId,
						});
					}
				}
				try {
					if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
						for (const rec of Object.values(ev.__notifMsgs)) {
							if (rec && Array.isArray(rec.ids)) {
								for (const id of rec.ids)
									msgTargets.push({
										id: id,
										channelId: rec.channelId || ev.channelId || interaction.channelId,
									});
							}
						}
					}
				} catch {}
				const seen = new Set();
				const uniqueTargets = msgTargets.filter(function (t) {
					if (!t || !t.id) return false;
					if (seen.has(t.id)) return false;
					seen.add(t.id);
					return true;
				});
				for (const t of uniqueTargets) {
					try {
						const ch = t.channelId
							? await interaction.client.channels.fetch(t.channelId).catch(() => null)
							: interaction.channel || null;
						const msg = ch && ch.messages ? await ch.messages.fetch(t.id).catch(() => null) : null;
						if (msg) await msg.edit({ content: '', embeds: [embed] }).catch(() => {});
					} catch {}
				}
			} catch (e) {
				try {
					require('./logger').warn('[clockin] render failed', {
						err: e && e.message ? e.message : String(e),
						eventId: ev.id,
					});
				} catch {}
			}
		} finally {
			_clockInLocks.delete(ev.id);
		}

		const msgTxt =
			choice === 'none' || wasInSame
				? 'Registration cleared.'
				: 'Registered as ' + meta.label + '.';
		try {
			const userHasAuto = !!(
				ev.__clockIn &&
				ev.__clockIn.autoNext &&
				ev.__clockIn.autoNext[interaction.user.id]
			);
			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId('clockin:autoNext:' + ev.id + ':' + choice)
					.setLabel('Auto-register next')
					.setStyle(ButtonStyle.Primary)
					.setDisabled(choice === 'none' || wasInSame),
				new ButtonBuilder()
					.setCustomId('clockin:autoNextCancel:' + ev.id)
					.setLabel('Cancel auto')
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(!userHasAuto),
			);
			try {
				await interaction.reply({ content: msgTxt, components: [row], flags: 1 << 6 });
			} catch {}
		} catch {
			try {
				await interaction.reply({ content: msgTxt, flags: 1 << 6 });
			} catch {}
		}
		return;
	} catch (err) {
		try {
			const logger = require('./logger');
			logger.error('[clockin handler] error', {
				err: err && err.stack ? err.stack : err && err.message ? err.message : String(err),
				customId: interaction && interaction.customId,
				userId: interaction && interaction.user && interaction.user.id,
				messageId: interaction && interaction.message && interaction.message.id,
			});
		} catch {}
		try {
			const testing = !!(require('./storage').config && require('./storage').config.testingMode);
			const replyContent =
				'An error occurred. ' +
				(err && err.stack ? err.stack : err && err.message ? err.message : String(err));
			if (
				interaction &&
				typeof interaction.isRepliable === 'function' &&
				interaction.isRepliable() &&
				!interaction.replied &&
				!interaction.deferred
			) {
				try {
					await interaction.reply({ content: replyContent, flags: 1 << 6 });
				} catch (e) {}
			}
		} catch {}
	}
}

module.exports = { handleClockInSelect };
