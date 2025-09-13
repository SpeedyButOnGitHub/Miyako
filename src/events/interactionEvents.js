const { InteractionType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ALLOWED_ROLES, CHATBOX_BUTTON_ID, isModerator } = require("../commands/moderation/permissions");
const { handleWarningButtons } = require("../commands/moderation/index");
const { config, saveConfig } = require("../utils/storage");
const { EMOJI_SUCCESS, EMOJI_ERROR } = require("../commands/moderation/replies");
const { renderSettingEmbed } = require("../commands/configMenu");
const { handleScheduleModal, handleEventCreateModal, handleEventEditModal, handleEventNotificationModal } = require("../commands/schedule");
const { getEvent, updateEvent } = require('../utils/eventsStorage');
const ActiveMenus = require("../utils/activeMenus");
const { sendModLog } = require("../utils/modLogs");

// Instrumentation: detect legacy ephemeral property usage at runtime.
// removed unused instrumentInteraction (ephemeral option audit)
const { sendUserDM } = require("../commands/moderation/dm");
const { buildDepositMenuPayload, buildWithdrawMenuPayload, buildBalancePayload } = require("../commands/balance");
const { addProgress } = require("../utils/depositProgress");
const { depositToBank, withdrawFromBank, quoteDeposit, getBank, getBaseLimit, computeMaxAffordableDeposit } = require("../utils/bank");
// const { getCash, getTestingCash } = require("../utils/cash");
const { semanticButton } = require("../ui");

// Pending Kick/Ban confirmations: key = `${userId}:${action}:${moderatorId}` -> { reason: string|null, originChannelId?:string, originMessageId?:string }
const pendingPunishments = new Map();
// Lightweight in-memory locks to avoid concurrent edits stomping clock-in positions
const _clockInLocks = new Set();

// Exported helper: handle clock-in select menu interactions directly (used by tests)
async function handleClockInSelect(interaction) {
	try {
		// Clock-In position select
		if (!(interaction.isStringSelectMenu && interaction.isStringSelectMenu()) && !interaction.customId?.startsWith?.('clockin:')) return;
		const parts = interaction.customId.split(':'); // clockin:eventId:notifId
		const evId = parts[1];
		const notifId = parts[2]; // may help to resolve if eventId is stale
		let ev = getEvent(evId);
		if (!ev) {
			try { const { getEvent: ge } = require('../utils/eventsStorage'); ev = ge(evId); } catch {}
		}
		// Fallbacks: by message id, then by notif id (if present)
		if (!ev) {
			try {
				const { getEvents } = require('../utils/eventsStorage');
				const all = getEvents();
				// 1) resolve by message id present on clock-in records
				if (interaction.message?.id) {
					ev = all.find(e => Array.isArray(e.__clockIn?.messageIds) && e.__clockIn.messageIds.includes(interaction.message.id)) || null;
				}
				// 2) resolve by notif id belonging to this event's autoMessages
				if (!ev && notifId) {
					ev = all.find(e => Array.isArray(e.autoMessages) && e.autoMessages.some(n => String(n.id) === String(notifId) && n.isClockIn)) || null;
				}
				// 3) templated customId recovery: if evId looks like a template (e.g., {{EVENT_ID}}), try channel/name heuristics
				const looksTemplated = (s) => typeof s === 'string' && s.includes('{');
				if (!ev && looksTemplated(evId)) {
					// a) try by embed title -> event name
					try {
						const title = interaction.message?.embeds?.[0]?.title || '';
						const partsT = title.split('—'); // em dash separator
						let name = null;
						if (partsT.length >= 2) name = partsT[partsT.length - 1].trim();
						if (name && name !== '{{EVENT_NAME}}') {
							ev = all.find(e => (e.name || '').trim() === name) || ev;
						}
					} catch {}
					// b) try by channel affinity (stored clock-in channel or event channel)
					if (!ev && interaction.channelId) {
						const cand = all.filter(e => (e.__clockIn?.channelId === interaction.channelId) || (e.channelId === interaction.channelId));
						if (cand.length === 1) ev = cand[0];
						else if (cand.length > 1) {
							// Prefer the most recently clock-in-sent event
							cand.sort((a,b) => (b.__clockIn?.lastSentTs||0) - (a.__clockIn?.lastSentTs||0));
							ev = cand[0];
						}
					}
				}
			} catch {}
		}
		// If we recovered an event via heuristics, backfill this message id for future lookups
		if (ev && interaction.message?.id) {
			try {
				const clock = ev.__clockIn && typeof ev.__clockIn==='object' ? { ...ev.__clockIn } : { positions:{}, messageIds:[] };
				if (!Array.isArray(clock.messageIds)) clock.messageIds = [];
				if (!clock.messageIds.includes(interaction.message.id)) {
					clock.messageIds.push(interaction.message.id);
					if (clock.messageIds.length > 10) clock.messageIds = clock.messageIds.slice(-10);
					updateEvent(ev.id, { __clockIn: clock });
				}
			} catch {}
		}
		if (!ev) {
			await interaction.reply({ content:'Event missing.', flags:1<<6 }).catch(()=>{});
			// Also log details to the config log channel for maintainers to debug
			try {
				const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
				if (CONFIG_LOG_CHANNEL) {
					const ch = await interaction.client.channels.fetch(CONFIG_LOG_CHANNEL).catch(()=>null);
					if (ch) {
						const gid = interaction.guildId || 'guild';
						const cid = interaction.channelId || 'channel';
						const mid = interaction.message?.id;
						const link = mid ? `https://discord.com/channels/${gid}/${cid}/${mid}` : '(no message id)';
						await ch.send({ content: `⚠️ Clock-in select could not resolve event. customId="${interaction.customId}" user=<@${interaction.user?.id}> link: ${link}` }).catch(()=>{});
					}
				}
			} catch {}
			return;
		}
		const member = interaction.member;
		if (!member) { await interaction.reply({ content:'Member not found.', flags:1<<6 }).catch(()=>{}); return; }
		const choice = interaction.values[0];
		const ROLE_REQUIRED = '1375958480380493844';
		const POS_META = {
			'instance_manager': { label: 'Instance Manager', max:1, role: ROLE_REQUIRED },
			'manager': { label: 'Manager', max:Infinity, role: ROLE_REQUIRED },
			'bouncer': { label: 'Bouncer', max:Infinity },
			'bartender': { label: 'Bartender', max:Infinity },
			'backup': { label: 'Backup', max:Infinity },
			'maybe': { label: 'Maybe/Late', max:Infinity },
			'none': { label: 'Unregister', max:Infinity }
		};
		if (!POS_META[choice]) { await interaction.reply({ content:'Invalid selection.', flags:1<<6 }).catch(()=>{}); return; }
		const meta = POS_META[choice];
		if (choice !== 'none' && meta.role && !member.roles.cache.has(meta.role)) {
			await interaction.reply({ content:`You need the required role to select ${meta.label}.`, flags:1<<6 }).catch(()=>{}); return;
		}
		const clockKey = '__clockIn';
		// Acquire lightweight in-memory lock for this event to avoid races that remove other users
		if (_clockInLocks.has(ev.id)) {
			try { await interaction.reply({ content: 'Clock-in is busy, please try again in a moment.', flags: 1<<6 }); } catch {}
			return;
		}
		_clockInLocks.add(ev.id);
		// Declare these in outer scope so we can reference after try/finally
		let wasIn = false;
		let wasInSame = false;
		try {
			// Deep clone positions to avoid mutating shared objects
			const existing = ev[clockKey] && typeof ev[clockKey] === 'object' ? ev[clockKey] : { positions: {}, messageIds: [] };
			const positions = JSON.parse(JSON.stringify(existing.positions || {}));
			const messageIds = Array.isArray(existing.messageIds) ? existing.messageIds.slice() : [];
			// Determine current membership
			wasIn = Object.keys(positions).some(pos => Array.isArray(positions[pos]) && positions[pos].includes(member.id));
			wasInSame = wasIn && Array.isArray(positions[choice]) && positions[choice].includes(member.id);
			// Remove user from all positions in cloned map
			for (const key of Object.keys(positions)) {
				positions[key] = Array.isArray(positions[key]) ? positions[key].filter(id => id !== member.id) : [];
			}
			// Add to chosen position unless unregistering or re-selecting same
			if (choice !== 'none' && !wasInSame) {
				if (!Array.isArray(positions[choice])) positions[choice] = [];
				if (meta.max !== Infinity && positions[choice].length >= meta.max) {
					await interaction.reply({ content:`${meta.label} is full.`, flags:1<<6 }).catch(()=>{});
					return;
				}
				positions[choice].push(member.id);
			}
			const newClock = { ...existing, positions, messageIds };
			// Persist runtime overlay immediately
			try { updateEvent(ev.id, { [clockKey]: newClock }); } catch (e) { try { require('../utils/logger').warn('[clockin] updateEvent failed', { err: e?.message, eventId: ev.id }); } catch {} }
			// Re-render all clock-in messages using the hydrated event so embed builder sees updated positions
			try {
				const { buildClockInEmbed } = require('../utils/clockinTemplate');
				const hydrated = { ...ev, [clockKey]: newClock };
				const embed = buildClockInEmbed(hydrated);
				// Collect message targets from multiple runtime locations for robustness
				const msgTargets = [];
				// 1) explicit __clockIn.messageIds
				if (Array.isArray(newClock.messageIds)) {
					for (const id of newClock.messageIds) {
						msgTargets.push({ id, channelId: newClock.channelId || ev.channelId || interaction.channelId });
					}
				}
				// 2) per-notification mapping __notifMsgs (may contain channelId and ids array)
				try {
					if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
						for (const [nid, rec] of Object.entries(ev.__notifMsgs)) {
							if (rec && Array.isArray(rec.ids)) {
								for (const id of rec.ids) msgTargets.push({ id, channelId: rec.channelId || ev.channelId || interaction.channelId });
							}
						}
					}
				} catch {}
				// De-duplicate by id
				const seen = new Set();
				const uniqueTargets = msgTargets.filter(t => { if (!t || !t.id) return false; if (seen.has(t.id)) return false; seen.add(t.id); return true; });
				for (const t of uniqueTargets) {
					try {
						const ch = t.channelId ? await interaction.client.channels.fetch(t.channelId).catch(()=>null) : (interaction.channel || null);
						const msg = ch && ch.messages ? await ch.messages.fetch(t.id).catch(()=>null) : null;
						if (msg) await msg.edit({ content: '', embeds:[embed] }).catch(()=>{});
					} catch {}
				}
			} catch (e) { try { require('../utils/logger').warn('[clockin] render failed', { err: e?.message, eventId: ev.id }); } catch {} }
		} finally {
			_clockInLocks.delete(ev.id);
		}
		const msgTxt = (choice === 'none' || wasInSame) ? 'Registration cleared.' : `Registered as ${meta.label}.`;
		try {
			const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
			// Disable cancel auto when user does not currently have an autoNext set
			const userHasAuto = !!(ev.__clockIn && ev.__clockIn.autoNext && ev.__clockIn.autoNext[interaction.user.id]);
			const row = new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`clockin:autoNext:${ev.id}:${choice}`).setLabel('Auto-register next').setStyle(ButtonStyle.Primary).setDisabled(choice==='none' || wasInSame),
				new ButtonBuilder().setCustomId(`clockin:autoNextCancel:${ev.id}`).setLabel('Cancel auto').setStyle(ButtonStyle.Secondary).setDisabled(!userHasAuto)
			);
			await interaction.reply({ content: msgTxt, components:[row], flags:1<<6 }).catch(()=>{});
		} catch {
			await interaction.reply({ content: msgTxt, flags:1<<6 }).catch(()=>{});
		}
		return;
	} catch (err) {
		try {
			const logger = require('../utils/logger');
			logger.error('[Interaction Error]', { err: err.stack || err.message || String(err), customId: interaction?.customId, userId: interaction?.user?.id, messageId: interaction?.message?.id });
		} catch {}
		// Show stack to developers when testingMode is enabled; otherwise show concise message
		try {
			const testing = !!(require('../utils/storage').config?.testingMode);
			const replyContent = testing ? `An error occurred.\n${err.stack || err.message || String(err)}` : `An error occurred.\n${err.message || String(err)}`;
			if (interaction && interaction.isRepliable && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
				await interaction.reply({ content: replyContent, flags: 1<<6 }).catch(() => {});
			}
		} catch {}
	}
}

function attachInteractionEvents(client) {
	// Idempotent attach guard to prevent duplicate listener registration
	if (client.__interactionListenerAttached) return;
	client.__interactionListenerAttached = true;
	client.on("interactionCreate", async (interaction) => {
		// Attach command logging wrappers to interaction reply/edit methods
		try { require('../utils/commandLogger').instrumentInteractionLogging(interaction); } catch {}

		// Safety: for component interactions (buttons/selects) install a short-lived
		// fallback timer that will call deferUpdate if the handler hasn't acknowledged
		// the interaction within ~2200ms. This prevents the Discord client from
		// showing "This interaction failed" when a handler hangs or throws before
		// replying. We monkey-patch common acking methods so the timer is cleared
		// as soon as any normal acknowledgement runs.
		let __interactionSafetyTimer = null;
		const __clearInteractionSafety = () => {
			try { if (__interactionSafetyTimer) { clearTimeout(__interactionSafetyTimer); __interactionSafetyTimer = null; } } catch {}
		};
		try {
			const _isButton = typeof interaction.isButton === 'function' ? interaction.isButton() : false;
			const _isSelect = typeof interaction.isStringSelectMenu === 'function' ? interaction.isStringSelectMenu() : false;
			const _isComponent = _isButton || _isSelect;
			if (_isComponent) {
				// Wrap common acknowledgement methods to clear the safety timer when called
				const wrap = (name) => {
					try {
						if (!interaction) return;
						const fn = interaction[name];
						if (typeof fn !== 'function') return;

						// If this is a Jest spy/mock, try to preserve its original implementation
						// without causing recursion. We capture the current mocked implementation
						// (if any) and install a mockImplementation that calls that captured
						// implementation while first clearing the safety timer.
						if (fn && fn.mock && typeof fn.mockImplementation === 'function') {
							// Attempt to get the existing implementation from the mock
							let existingImpl = null;
							try {
								if (typeof fn.getMockImplementation === 'function') existingImpl = fn.getMockImplementation();
							} catch (e) {}
							try {
								if (!existingImpl && typeof fn._getMockImplementation === 'function') existingImpl = fn._getMockImplementation();
							} catch (e) {}

							// If there's an underlying implementation, use it. Otherwise don't wrap
							// (preserve a pure mock as-is to avoid breaking test spies).
							if (existingImpl) {
								fn.mockImplementation(async (...args) => { __clearInteractionSafety(); return existingImpl.apply(interaction, args); });
							}
							return;
						}

						// Normal runtime function: bind and replace with a wrapper that clears the timer.
						const orig = fn.bind(interaction);
						interaction[name] = async (...args) => { __clearInteractionSafety(); return orig(...args); };
					} catch (e) {}
				};
				wrap('reply'); wrap('deferUpdate'); wrap('update'); wrap('showModal');

				__interactionSafetyTimer = setTimeout(async () => {
					try {
						// Only best-effort defer when the interaction appears repliable and not yet acked
						if (interaction && typeof interaction.isRepliable === 'function' && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
							await interaction.deferUpdate().catch(() => {});
							try { require('../utils/logger').info('[Interaction Safety Defer]', { customId: interaction?.customId || null, userId: interaction?.user?.id || null }); } catch {}
						}
					} catch (e) {}
				}, 2200);
				if (__interactionSafetyTimer && typeof __interactionSafetyTimer.unref === 'function') __interactionSafetyTimer.unref();
			}
		} catch (e) { __clearInteractionSafety(); }
		try {
			// Route persistent session UIs first
			if (interaction.isButton() || interaction.isStringSelectMenu()) {
				const res = await ActiveMenus.processInteraction(interaction);
				if (res && res.handled) return;
			}

			// Cash balance quick button (with cash drop broadcast redirect)
			if (interaction.isButton() && interaction.customId && interaction.customId.startsWith("cash:check")) {
				const { buildBalancePayload } = require("../commands/balance");
				const payload = buildBalancePayload(interaction.user.id);
				let jumpLink = null;
				try {
					const { activeDrops } = require('../utils/cashDrops');
					const dropActive = activeDrops && Array.from(activeDrops.values()).some(d => d && !d.claimedBy && d.expiresAt > Date.now());
					if (dropActive) {
						const BROADCAST_CHANNEL_ID = '1232701768987578462';
						const ch = await interaction.client.channels.fetch(BROADCAST_CHANNEL_ID).catch(()=>null);
						if (ch && ch.send) {
							const pubMsg = await ch.send({ content: `🔍 Balance Check: <@${interaction.user.id}>`, ...payload, allowedMentions:{ users:[interaction.user.id] } }).catch(()=>null);
							if (pubMsg) jumpLink = `https://discord.com/channels/${pubMsg.guildId}/${pubMsg.channelId}/${pubMsg.id}`;
						}
					}
				} catch {}
				if (jumpLink) {
					await interaction.reply({ content: `Balance posted here → ${jumpLink}`, flags: 1<<6 }).catch(()=>{});
				} else {
					await interaction.reply({ ...payload, flags: 1<<6 }).catch(() => {});
				}
				return;
			}

			// --- Application Apply Buttons & Flow ---
			if (interaction.isButton() && interaction.customId.startsWith('apply_app_')) {
				const appId = interaction.customId.split('_').pop();
				try {
					const { getApplication, canApply, listSubmissions } = require('../utils/applications');
					const { startSession, getSession, recordAnswer, abandonSession } = require('../utils/applicationFlow');
					const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
					const app = getApplication(appId);
					if (!app) return interaction.reply({ content: 'Application not found.', flags:1<<6 }).catch(()=>{});
					if (!Array.isArray(app.questions) || app.questions.length === 0) return interaction.reply({ content: 'This application has no questions configured.', flags:1<<6 }).catch(()=>{});
					const member = interaction.member; if (!member) return interaction.reply({ content:'Member not resolved.', flags:1<<6 }).catch(()=>{});
					const gate = canApply(member, app); if (!gate.ok) return interaction.reply({ content: gate.reason, flags:1<<6 }).catch(()=>{});
					// Rate limit: if a pending submission for this app exists in last 24h for this user
					const recent = listSubmissions({}).filter(s => s.appId === String(app.id) && s.userId === member.id && s.status === 'pending' && (Date.now() - s.createdAt) < 24*60*60*1000);
					if (recent.length) {
						return interaction.reply({ content:'You already have a pending application for this in the last 24h. Please wait for a decision.', flags:1<<6 }).catch(()=>{});
					}
					// Start or resume session
					let sess = getSession(member.id, app.id) || startSession(member.id, app.id);
					// If already answered all, show confirmation
					if (sess.index >= app.questions.length) {
						const confirmRow = new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`appconfirm_submit_${app.id}`).setLabel('Submit').setStyle(ButtonStyle.Success),
							new ButtonBuilder().setCustomId(`appconfirm_cancel_${app.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
						);
						return interaction.reply({ content: app.confirmMessage || 'Submit application?', components:[confirmRow], flags:1<<6 }).catch(()=>{});
					}
					// Ask next question via modal
					const q = app.questions[sess.index];
					const modalId = `appq_${app.id}_${q.id}_${Date.now()}`;
					const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Q${sess.index+1}/${app.questions.length}`);
					const ti = new TextInputBuilder()
						.setCustomId('answer')
						.setLabel(q.label?.slice(0,45) || `Question ${sess.index+1}`)
						.setStyle(q.type === 'long' ? TextInputStyle.Paragraph : TextInputStyle.Short)
						.setRequired(!!q.required);
					modal.addComponents(new ActionRowBuilder().addComponents(ti));
					await interaction.showModal(modal);
					const submitted = await interaction.awaitModalSubmit({ time: 5 * 60 * 1000, filter: i => i.customId === modalId && i.user.id === member.id }).catch(()=>null);
					if (!submitted) { return; }
					const ans = submitted.fields.getTextInputValue('answer') || '';
					if (q.required && !ans.trim()) {
						await submitted.reply({ content:'Answer required.', flags:1<<6 }).catch(()=>{});
						abandonSession(member.id, app.id);
						return;
					}
					sess = recordAnswer(member.id, app.id, q.id, ans.trim());
					if (sess.index >= app.questions.length) {
						// Show preview summary embed ephemeral
						const embed = new EmbedBuilder().setTitle(`${app.name} — Preview`).setDescription('Review your answers then submit.')
							.setColor(0x5865F2);
						for (const qa of sess.answers.slice(0, 15)) {
							const qq = app.questions.find(x => String(x.id) === String(qa.qid));
							if (!qq) continue;
							embed.addFields({ name: qq.label.slice(0, 256), value: qa.answer.slice(0, 1024) || '*blank*' });
						}
						const row = new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`appconfirm_submit_${app.id}`).setLabel('Submit').setStyle(ButtonStyle.Success),
							new ButtonBuilder().setCustomId(`appconfirm_cancel_${app.id}`).setLabel('Cancel').setStyle(ButtonStyle.Danger)
						);
						await submitted.reply({ embeds:[embed], components:[row], flags:1<<6 }).catch(()=>{});
					} else {
						await submitted.reply({ content:`Saved answer (${sess.index}/${app.questions.length}). Use the Apply button again for next question.`, flags:1<<6 }).catch(()=>{});
					}
				} catch (e) {
					try { require('../utils/logger').error('[apply_app_flow] error', { err: e.message }); } catch {}
					return interaction.reply({ content:'Error starting flow.', flags:1<<6 }).catch(()=>{});
				}
			}

			// Confirmation buttons: submit or cancel
			if (interaction.isButton() && (interaction.customId.startsWith('appconfirm_submit_') || interaction.customId.startsWith('appconfirm_cancel_'))) {
				const parts = interaction.customId.split('_');
				const action = parts[1]; // submit or cancel
				const appId = parts.pop();
				const { getApplication, addSubmission } = require('../utils/applications');
				const { getSession, abandonSession } = require('../utils/applicationFlow');
				const app = getApplication(appId);
				if (!app) return interaction.reply({ content:'Application missing.', flags:1<<6 }).catch(()=>{});
				const sess = getSession(interaction.user.id, appId);
				if (!sess) return interaction.reply({ content:'Session expired. Start again.', flags:1<<6 }).catch(()=>{});
				if (action === 'cancel') {
					abandonSession(interaction.user.id, appId);
					return interaction.reply({ content:'Application cancelled.', flags:1<<6 }).catch(()=>{});
				}
				// Build answers array matching order
				const answers = sess.answers.map(a => ({ qid: a.qid, answer: a.answer }));
				const submission = addSubmission(app.id, interaction.user.id, answers);
				abandonSession(interaction.user.id, appId);
				// Notify managers (placeholder: send to submissionChannelId if set)
				if (app.submissionChannelId) {
					try {
						const ch = await interaction.client.channels.fetch(app.submissionChannelId).catch(()=>null);
						if (ch) {
							const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
							const emb = new EmbedBuilder().setTitle(`${app.name} Submission #${submission.id}`)
								.setDescription(`Applicant: <@${interaction.user.id}>`)
								.setColor(0x2f3136)
								.setTimestamp();
							for (const qa of answers.slice(0, 23)) {
								const qq = app.questions.find(q => String(q.id) === String(qa.qid));
								if (!qq) continue;
								emb.addFields({ name: qq.label.slice(0, 256), value: qa.answer.slice(0, 1024) || '*blank*' });
							}
							const row = new ActionRowBuilder().addComponents(
								new ButtonBuilder().setCustomId(`appreview_accept_${app.id}_${submission.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
								new ButtonBuilder().setCustomId(`appreview_deny_${app.id}_${submission.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
							);
							await ch.send({ embeds:[emb], components:[row] }).catch(()=>{});
						}
					} catch {}
				}
				return interaction.reply({ content: app.completionMessage || 'Application submitted.', flags:1<<6 }).catch(()=>{});
			}

			// Manager accept / deny buttons (placeholder status update)
			if (interaction.isButton() && interaction.customId.startsWith('appreview_')) {
				const parts = interaction.customId.split('_'); // appreview,action,appId,submissionId
				const action = parts[1];
				const appId = parts[2];
				const submissionId = parts[3];
				try {
					const { getApplication, updateSubmission, listSubmissions } = require('../utils/applications');
					const app = getApplication(appId);
					if (!app) return interaction.reply({ content:'App missing.', flags:1<<6 }).catch(()=>{});
					// Authorization: must have one of managerRoles
					const member = interaction.member;
					if (!member || !app.managerRoles.some(r => member.roles.cache.has(r))) {
						return interaction.reply({ content:'Not authorized.', flags:1<<6 }).catch(()=>{});
					}
					// Concurrency guard: if already decided, block
					const current = listSubmissions({}).find(s => String(s.id) === String(submissionId));
					if (!current) return interaction.reply({ content:'Submission missing.', flags:1<<6 }).catch(()=>{});
					if (current.status !== 'pending') {
						return interaction.reply({ content:`Already ${current.status}.`, flags:1<<6 }).catch(()=>{});
					}
					const newStatus = action === 'accept' ? 'accepted' : 'denied';
					const updated = updateSubmission(submissionId, { status: newStatus, decidedAt: Date.now(), decidedBy: interaction.user.id });
					if (!updated) return interaction.reply({ content:'Update failed.', flags:1<<6 }).catch(()=>{});
					// Role assignment logic on accept / cleanup on deny
					try {
						const guildMember = await interaction.guild.members.fetch(updated.userId).catch(()=>null);
						if (guildMember) {
							if (newStatus === 'accepted') {
								// Remove pending role if present
								if (app.pendingRole && guildMember.roles.cache.has(app.pendingRole)) {
									await guildMember.roles.remove(app.pendingRole).catch(()=>{});
								}
								for (const r of app.acceptedRoles || []) {
									if (!guildMember.roles.cache.has(r)) await guildMember.roles.add(r).catch(()=>{});
								}
							} else if (newStatus === 'denied') {
								// Remove pending role if any; do not grant accepted roles
								if (app.pendingRole && guildMember.roles.cache.has(app.pendingRole)) {
									await guildMember.roles.remove(app.pendingRole).catch(()=>{});
								}
							}
						}
					} catch {}
					// DM applicant with decision (best-effort, template supports {user}, {application}/{app})
					try {
						const template = newStatus === 'accepted'
							? (app.acceptMessage || 'Your application has been accepted!')
							: (app.denyMessage || 'Your application has been denied.');
						const content = template
							.replace(/\{user\}/gi, `<@${updated.userId}>`)
							.replace(/\{application\}/gi, app.name || 'Application')
							.replace(/\{app\}/gi, app.name || 'Application');
						const userObj = await interaction.client.users.fetch(updated.userId).catch(()=>null);
						if (userObj) {
							await userObj.send({ content }).catch(()=>{});
						}
					} catch {}
					try { await interaction.update({ content: `Submission ${newStatus.toUpperCase()}.`, embeds: interaction.message.embeds, components: [] }); } catch {}
				} catch (e) {
					try { require('../utils/logger').error('[appreview] error', { err: e.message }); } catch {}
					return interaction.reply({ content:'Error processing.', flags:1<<6 }).catch(()=>{});
				}
			}

			// --- New Balance Menu System ---
			if (interaction.isButton() && interaction.customId === "bank:menu:deposit") {
				await interaction.deferUpdate().catch(() => {});
				try { await interaction.message.edit(buildDepositMenuPayload(interaction.user.id)); } catch {}
				return;
			}
			if (interaction.isButton() && interaction.customId === "bank:menu:withdraw") {
				await interaction.deferUpdate().catch(() => {});
				try { await interaction.message.edit(buildWithdrawMenuPayload(interaction.user.id)); } catch {}
				return;
			}
			if (interaction.isButton() && interaction.customId === "bank:back") {
				await interaction.deferUpdate().catch(() => {});
				try { await interaction.message.edit(buildBalancePayload(interaction.user.id)); } catch {}
				return;
			}

			// Deposit amount (opens modal) -> ephemeral confirmation
			if (interaction.isButton() && interaction.customId === "bank:deposit:amount") {
				const modalId = `bank_deposit_amount_${Date.now()}`;
				const modal = new ModalBuilder().setCustomId(modalId).setTitle("Deposit Amount").addComponents(new ActionRowBuilder().addComponents(
					new TextInputBuilder().setCustomId("amount").setLabel("Amount (number)").setStyle(TextInputStyle.Short).setRequired(true)
				));
				await interaction.showModal(modal);
				const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
				if (!submitted) return;
				const raw = submitted.fields.getTextInputValue("amount");
				const amt = Math.max(0, Math.floor(Number((raw||"").replace(/[^0-9]/g, "")) || 0));
				if (amt <= 0) { await submitted.reply({ content: "❌ Enter a positive amount.", flags: 1<<6 }); return; }
				const q = quoteDeposit(interaction.user.id, amt);
				if (!q.ok) { await submitted.reply({ content: "❌ Invalid amount.", flags: 1<<6 }); return; }
				const taxPct = q.deposit > 0 ? (q.tax / q.deposit) * 100 : 0;
				let warningLine = "";
				if (q.requiresConfirmation) {
					warningLine = `\n\n⚠️ **Warning:** Above / crossing daily limit. Tax: **$${q.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${q.totalCost.toLocaleString()}**).`;
				} else if (q.tax > 0) {
					warningLine = `\n\nTax: **$${q.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${q.totalCost.toLocaleString()}**).`;
				}
				const content = `Confirm depositing **$${q.deposit.toLocaleString()}**?${warningLine}`;
				const rootMsgId = interaction.message?.id; // original menu message id
				const row = new ActionRowBuilder().addComponents(
					semanticButton('success', { id: `bank:confirm:${q.deposit}:${q.tax}:${q.totalCost}:${rootMsgId}`, label: 'Confirm' }),
					semanticButton('primary', { id: `bank:confirm:toLimit:${rootMsgId}`, label: 'To Limit' }),
					semanticButton('nav', { id: 'bank:decline', label: 'Cancel' })
				);
				await submitted.reply({ content, components: [row], flags: 1<<6 }).catch(() => {});
				return;
			}

			// Deposit Max logic per spec
			if (interaction.isButton() && interaction.customId === "bank:deposit:max") {
				const bankBal = getBank(interaction.user.id) || 0;
				const base = getBaseLimit();
				const maxAff = computeMaxAffordableDeposit(interaction.user.id);
				if (maxAff.deposit <= 0) {
					await interaction.reply({ content: "Nothing to deposit.", flags: 1<<6 }).catch(()=>{});
					return;
				}
				const taxPct = maxAff.deposit > 0 ? (maxAff.tax / maxAff.deposit) * 100 : 0;
				const warnNeeded = bankBal >= base || (bankBal < base && bankBal + maxAff.deposit > base);
				const warn = warnNeeded ? `\n\n⚠️ **Warning:** Above / crossing daily limit. Tax: **$${maxAff.tax.toLocaleString()}** (${taxPct.toFixed(1)}%) (Total Cost: **$${maxAff.totalCost.toLocaleString()}**).` : (maxAff.tax ? `\n\nTax: **$${maxAff.tax.toLocaleString()}** (${taxPct.toFixed(1)}%)` : "");
				const content = `Confirm Deposit Max: **$${maxAff.deposit.toLocaleString()}**?${warn}`;
				const rootMsgId = interaction.message?.id;
				const row = new ActionRowBuilder().addComponents(
					semanticButton('danger', { id: `bank:confirm:${maxAff.deposit}:${maxAff.tax}:${maxAff.totalCost}:${rootMsgId}`, label: 'Confirm Max' }),
					semanticButton('primary', { id: `bank:confirm:toLimit:${rootMsgId}`, label: 'To Limit' }),
					semanticButton('nav', { id: 'bank:decline', label: 'Cancel' })
				);
				await interaction.reply({ content, components: [row], flags: 1<<6 }).catch(()=>{});
				return;
			}

			// Withdraw amount
			if (interaction.isButton() && interaction.customId === "bank:withdraw:amount") {
				const modalId = `bank_withdraw_amount_${Date.now()}`;
				const modal = new ModalBuilder().setCustomId(modalId).setTitle("Withdraw Amount").addComponents(new ActionRowBuilder().addComponents(
					new TextInputBuilder().setCustomId("amount").setLabel("Amount (number)").setStyle(TextInputStyle.Short).setRequired(true)
				));
				await interaction.showModal(modal);
				const submitted = await interaction.awaitModalSubmit({ time:30000, filter:i=>i.customId===modalId && i.user.id===interaction.user.id }).catch(()=>null);
				if (!submitted) return;
				const raw = submitted.fields.getTextInputValue("amount");
				const amt = Math.max(0, Math.floor(Number((raw||"").replace(/[^0-9]/g, ""))||0));
				if (amt<=0) { await submitted.reply({ content: "❌ Enter a positive amount.", flags:1<<6 }); return; }
				if (amt > getBank(interaction.user.id)) { await submitted.reply({ content: "❌ You don't have that much in the bank.", flags:1<<6 }); return; }
				const content = `Confirm withdrawing $${amt.toLocaleString()}?`;
				const rootMsgId = interaction.message?.id;
				const row = new ActionRowBuilder().addComponents(
					semanticButton('success', { id: `bank:withdraw:confirm:${amt}:${rootMsgId}`, label: 'Confirm' }),
					semanticButton('nav', { id: 'bank:decline', label: 'Cancel' })
				);
				await submitted.reply({ content, components:[row], flags:1<<6 }).catch(()=>{});
				return;
			}

			// Withdraw Max (no penalty) -> confirm
			if (interaction.isButton() && interaction.customId === "bank:withdraw:max") {
				const bankBal = getBank(interaction.user.id);
				if (bankBal <= 0) { await interaction.reply({ content: "Bank is empty.", flags:1<<6 }).catch(()=>{}); return; }
				const rootMsgId = interaction.message?.id;
				const row = new ActionRowBuilder().addComponents(
					semanticButton('danger', { id: `bank:withdraw:confirm:${bankBal}:${rootMsgId}`, label: 'Confirm Withdraw All' }),
					semanticButton('nav', { id: 'bank:decline', label: 'Cancel' })
				);
				await interaction.reply({ content: `Withdraw all $${bankBal.toLocaleString()}?`, components:[row], flags:1<<6 }).catch(()=>{});
				return;
			}

			// Confirmation handlers
			if (interaction.isButton() && interaction.customId.startsWith("bank:confirm:toLimit")) {
				const parts = interaction.customId.split(":");
				const rootId = parts[3];
				const base = getBaseLimit();
				const bankBal = getBank(interaction.user.id);
				if (bankBal >= base) {
					await interaction.reply({ content: "Already at or above the daily limit.", flags:1<<6 }).catch(()=>{});
					return;
				}
				const needed = base - bankBal;
				const q = quoteDeposit(interaction.user.id, needed);
				if (!q.ok) { await interaction.reply({ content: "❌ Could not compute required amount.", flags:1<<6 }).catch(()=>{}); return; }
				const res = depositToBank(interaction.user.id, q.deposit, { allowAboveLimit:true });
				if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Deposit failed"}`, flags:1<<6 }).catch(()=>{}); return; }
				addProgress(interaction.user.id, res.moved || 0);
				const pct = res.moved ? ((res.tax || 0) / res.moved) * 100 : 0;
				await interaction.reply({ content: `✅ Deposited $${res.moved.toLocaleString()} to reach the daily limit.${res.tax?` Tax $${res.tax.toLocaleString()} (${pct.toFixed(1)}%)`:''}`, flags:1<<6 }).catch(()=>{});
				// Revert original menu (if we have the id) back to root balance
				if (rootId) {
					try {
						const channel = interaction.channel;
						if (channel?.messages?.fetch) {
							const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
							if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
						}
					} catch {}
				}
				return;
			}
			if (interaction.isButton() && interaction.customId.startsWith("bank:confirm:")) {
				const parts = interaction.customId.split(":");
				const depositAmt = Number(parts[2])||0;
				const tax = Number(parts[3])||0;
				// total is not used further; compute only if needed
				const rootId = parts[5];
				const res = depositToBank(interaction.user.id, depositAmt, { allowAboveLimit:true });
				if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Deposit failed"}`, flags:1<<6 }).catch(()=>{}); return; }
				addProgress(interaction.user.id, res.moved || 0);
				await interaction.reply({ content: `✅ Deposited $${res.moved.toLocaleString()}${tax?` (Tax $${tax.toLocaleString()})`:""}.`, flags:1<<6 }).catch(()=>{});
				// Revert original menu back to balance root if we know it
				if (rootId) {
					try {
						const channel = interaction.channel;
						if (channel?.messages?.fetch) {
							const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
							if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
						}
					} catch {}
				}
				return;
			}
			if (interaction.isButton() && interaction.customId.startsWith("bank:withdraw:confirm:")) {
				const parts = interaction.customId.split(":");
				const amt = Number(parts[3])||0;
				const rootId = parts[4];
				const res = withdrawFromBank(interaction.user.id, amt);
				if (!res.ok) { await interaction.reply({ content: `❌ ${res.error||"Withdraw failed"}`, flags:1<<6 }).catch(()=>{}); return; }
				await interaction.reply({ content: `✅ Withdrew $${res.moved.toLocaleString()}.`, flags:1<<6 }).catch(()=>{});
				// Revert to root balance menu (withdraw does not affect progress)
				if (rootId) {
					try {
						const channel = interaction.channel;
						if (channel?.messages?.fetch) {
							const rootMsg = await channel.messages.fetch(rootId).catch(()=>null);
							if (rootMsg) await rootMsg.edit(buildBalancePayload(interaction.user.id)).catch(()=>{});
						}
					} catch {}
				}
				return;
			}
			if (interaction.isButton() && (interaction.customId === "bank:decline")) {
				await interaction.reply({ content: "❌ Cancelled.", flags: 64 }).catch(()=>{});
				return;
			}

			// (Old handlers removed and replaced by new menu system above)

			// Warnings dashboard/buttons/selects/modals (only routes warns:*)
			if (
				(interaction.isButton() && interaction.customId?.startsWith("warns:")) ||
				(interaction.isStringSelectMenu() && interaction.customId?.startsWith("warns:")) ||
				(interaction.type === InteractionType.ModalSubmit && interaction.customId?.startsWith("warns:"))
			) {
				await handleWarningButtons(client, interaction);
				return;
			}

			// Staff-only quick moderation actions from mod logs
			if (interaction.isButton() && interaction.customId?.startsWith("modact:")) {
				const parts = interaction.customId.split(":");
				// Patterns:
				// - modact:menu:<group>:<userId>
				// - modact:<action>:<userId>[:durationMs]
				// - modact:init:<kick|ban>:<userId>
				// - modact:confirm:<kick|ban>:<userId>
				// - modact:cancel:<kick|ban>:<userId>
				// - modact:changeReason:<kick|ban>:<userId>
				const kind = parts[1];
				const act = (kind === "menu" || ["init", "confirm", "cancel", "changeReason", "back"].includes(kind)) ? null : kind;
				const group = kind === "menu" ? parts[2] : null;
				const flowAction = ["init", "confirm", "cancel", "changeReason"].includes(kind) ? parts[2] : null; // kick|ban
				const uid = kind === "menu" ? parts[3] : (["init", "confirm", "cancel", "changeReason", "back"].includes(kind) ? parts[3] : parts[2]);
				const durMs = parts[4] ? Number(parts[4]) : (parts[3] && !["menu", "init", "confirm", "cancel", "changeReason", "back"].includes(kind) ? Number(parts[3]) : null);

				// Permission gate
				const member = interaction.member;
				if (!member || !isModerator(member)) {
					await interaction.reply({ content: `${EMOJI_ERROR} You are not allowed to use this.`, flags: 1<<6 }).catch(() => {});
					return;
				}

				// Resolve target
				const guild = interaction.guild;
				const targetMember = guild ? await guild.members.fetch(uid).catch(() => null) : null;
				const targetUser = targetMember?.user || (await client.users.fetch(uid).catch(() => null));
				if (!targetMember && !targetUser) {
					await interaction.reply({ content: `${EMOJI_ERROR} Could not resolve user.`, flags: 1<<6 }).catch(() => {});
					return;
				}

				const isTesting = !!config.testingMode;

				// Permission/hierarchy helpers for kick/ban
				const canActKickBan = (action) => {
					const g = interaction.guild;
					if (!g) return { ok: false, msg: `${EMOJI_ERROR} Not in a guild.` };
					const me = g.members?.me;
					const targetInGuild = !!targetMember;
					// Target membership constraints
					if (action === "kick" && !targetInGuild) {
						return { ok: false, msg: `${EMOJI_ERROR} That user is not in the server.` };
					}
					// Self-protection
					if (interaction.user.id === uid) {
						return { ok: false, msg: `${EMOJI_ERROR} You cannot ${action} yourself.` };
					}
					// Bot permission checks
					const needPerm = action === "kick" ? "KickMembers" : "BanMembers";
					if (!me || !me.permissions?.has?.(needPerm)) {
						return { ok: false, msg: `${EMOJI_ERROR} I lack permission to ${action} members.` };
					}
					// Role hierarchy checks when target is in guild
					if (targetInGuild) {
						const actorOwner = g.ownerId === interaction.user.id;
						if (!actorOwner) {
							const actorHighest = interaction.member?.roles?.highest?.position ?? 0;
							const targetHighest = targetMember.roles?.highest?.position ?? 0;
							if (actorHighest <= targetHighest) {
								return { ok: false, msg: `${EMOJI_ERROR} You cannot act on a member with an equal or higher role.` };
							}
						}
						const botHighest = me.roles?.highest?.position ?? 0;
						const targetHighest = targetMember.roles?.highest?.position ?? 0;
						if (botHighest <= targetHighest) {
							return { ok: false, msg: `${EMOJI_ERROR} I cannot act on a member with an equal or higher role than mine.` };
						}
					}
					return { ok: true };
				};

				// Helpers to access warnings store
				const ensureStores = () => {
					if (typeof config.warnings !== "object" || !config.warnings) config.warnings = {};
					if (typeof config.testingWarnings !== "object" || !config.testingWarnings) config.testingWarnings = {};
				};
				const getStore = () => (config.testingMode ? config.testingWarnings : config.warnings);
				const saveStore = () => { try { saveConfig(); } catch {} };

				// Helpers to build and swap rows on the original message
				const { semanticButton } = require('../ui');
				const buildTopRow = () => new ActionRowBuilder().addComponents(
					semanticButton('nav', { id: `modact:menu:warnings:${uid}`, label: 'Warnings', emoji: '⚠️' }),
					semanticButton('nav', { id: `modact:menu:mute:${uid}`, label: 'Mute', emoji: '⏰' }),
					semanticButton('nav', { id: `modact:init:kick:${uid}`, label: 'Kick', emoji: '👢' }),
					semanticButton('danger', { id: `modact:init:ban:${uid}`, label: 'Ban', emoji: '🔨' })
				);
				const swapRows = async (rows) => {
					await interaction.deferUpdate().catch(() => {});
					try { await interaction.message.edit({ components: rows }); } catch {}
				};

				// In-message submenus
				if (kind === "menu") {
					if (group === "warnings") {
						ensureStores();
						const store = getStore();
						const count = Array.isArray(store[uid]) ? store[uid].length : 0;
						const rows = [
							new ActionRowBuilder().addComponents(
								semanticButton('nav', { id: `modact:addwarn:${uid}`, label: 'Warn+', emoji: '➕' }),
								semanticButton('nav', { id: `modact:removewarn:${uid}`, label: 'Warn-', emoji: '➖', enabled: count !== 0 }),
								semanticButton('nav', { id: `modact:back:${uid}`, label: 'Back', emoji: '⬅️' })
							)
						];
						await swapRows(rows);
						return;
					} else if (group === "mute") {
						const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
						const rows = [
							new ActionRowBuilder().addComponents(
								semanticButton('danger', { id: `modact:mute:${uid}:3600000`, label: '1h', emoji: '⏱️' }),
								semanticButton('danger', { id: `modact:mute:${uid}:7200000`, label: '2h', emoji: '⏱️' }),
								semanticButton('danger', { id: `modact:mute:${uid}:21600000`, label: '6h', emoji: '⏱️' }),
								semanticButton('danger', { id: `modact:mute:${uid}:86400000`, label: '24h', emoji: '⏱️' })
							),
							new ActionRowBuilder().addComponents(
								semanticButton('success', { id: `modact:unmute:${uid}`, label: 'Unmute', emoji: '✅', enabled: isTimedOut }),
								semanticButton('nav', { id: `modact:back:${uid}`, label: 'Back', emoji: '⬅️' })
							)
						];
						await swapRows(rows);
						return;
					}
				}

				// Back to top-level row
				if (kind === "back") {
					await swapRows([buildTopRow()]);
					return;
				}

				// Kick/Ban flow: init -> optional reason -> ephemeral confirmation (confirm/cancel/changeReason)
				if (kind === "init" && (flowAction === "kick" || flowAction === "ban")) {
					const guard = canActKickBan(flowAction);
					if (!guard.ok) {
						await interaction.reply({ content: guard.msg, flags: 1<<6 }).catch(() => {});
						return;
					}
					// Prompt optional reason
					const modalId = `modact_reason_${flowAction}_${uid}_${Date.now()}`;
					const modal = new ModalBuilder()
						.setCustomId(modalId)
						.setTitle("Optional Reason")
						.addComponents(new ActionRowBuilder().addComponents(
							new TextInputBuilder().setCustomId("reason").setLabel("Reason (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false)
						));
					await interaction.showModal(modal);
					const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
					if (!submitted) {
						// User closed/dismissed the modal — do not send any confirmation message
						return;
					}
					let reason = null;
					const r = submitted.fields.getTextInputValue("reason");
					if (r && r.trim()) reason = r.trim();
					const key = `${uid}:${flowAction}:${interaction.user.id}`;
					// store origin message so we can restore buttons on cancel/confirm
					pendingPunishments.set(key, { reason, originChannelId: interaction.channelId, originMessageId: interaction.message?.id });
					const reasonText = reason && reason.trim() ? reason.trim() : "None";
					const content = `<@${uid}> will be ${flowAction === "kick" ? "kicked" : "banned"}.\nAre you sure you would like to proceed?\n\nReason provided: ${reasonText}`;
					const row = new ActionRowBuilder().addComponents(
						semanticButton('success', { id: `modact:confirm:${flowAction}:${uid}`, label: 'Confirm' }),
						semanticButton('danger', { id: `modact:cancel:${flowAction}:${uid}`, label: 'Cancel' }),
						semanticButton('primary', { id: `modact:changeReason:${flowAction}:${uid}`, label: 'Reason' })
					);
					await submitted.reply({ content, components: [row], flags: 1<<6 }).catch(() => {});
					return;
				}

				if ((kind === "confirm" || kind === "cancel" || kind === "changeReason") && (flowAction === "kick" || flowAction === "ban")) {
					const key = `${uid}:${flowAction}:${interaction.user.id}`;
					const state = pendingPunishments.get(key) || { reason: null };
					if (kind === "cancel") {
						await interaction.reply({ content: `${EMOJI_SUCCESS} ${flowAction === "kick" ? "Kick" : "Ban"} cancelled.`, flags: 1<<6 }).catch(() => {});
						pendingPunishments.delete(key);
						// restore original message buttons to top row
						try {
							if (state.originChannelId && state.originMessageId) {
								const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
								const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
								if (msg) {
									await msg.edit({ components: [buildTopRow()] }).catch(() => {});
								}
							}
						} catch {}
						return;
					}
					if (kind === "changeReason") {
						const modalId = `modact_reason_change_${flowAction}_${uid}_${Date.now()}`;
						const modal = new ModalBuilder()
							.setCustomId(modalId)
							.setTitle("Change Reason")
							.addComponents(new ActionRowBuilder().addComponents(
								new TextInputBuilder().setCustomId("reason").setLabel("Reason (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(state.reason || "")
							));
						await interaction.showModal(modal);
						const submitted = await interaction.awaitModalSubmit({ time: 30000, filter: i => i.customId === modalId && i.user.id === interaction.user.id }).catch(() => null);
						if (submitted) {
							const r = submitted.fields.getTextInputValue("reason");
							const newReason = r && r.trim() ? r.trim() : null;
							pendingPunishments.set(key, { reason: newReason, originChannelId: state.originChannelId, originMessageId: state.originMessageId });
							const reasonText = newReason ? newReason : "None";
							const content = `<@${uid}> will be ${flowAction === "kick" ? "kicked" : "banned"}.\nAre you sure you would like to proceed?\n\nReason provided: ${reasonText}`;
							const row = new ActionRowBuilder().addComponents(
								semanticButton('success', { id: `modact:confirm:${flowAction}:${uid}`, label: 'Confirm' }),
								semanticButton('danger', { id: `modact:cancel:${flowAction}:${uid}`, label: 'Cancel' }),
								semanticButton('primary', { id: `modact:changeReason:${flowAction}:${uid}`, label: 'Reason' })
							);
							await submitted.reply({ content, components: [row], flags: 1<<6 }).catch(() => {});
						}
						return;
					}
					if (kind === "confirm") {
						const guard = canActKickBan(flowAction);
						if (!guard.ok) {
							await interaction.reply({ content: guard.msg, flags: 1<<6 }).catch(() => {});
							pendingPunishments.delete(key);
							// restore original message buttons to top row
							try {
								if (state.originChannelId && state.originMessageId) {
									const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
									const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
									if (msg) {
										const { semanticButton } = require('../ui');
										const buildTopRow = () => new ActionRowBuilder().addComponents(
											semanticButton('nav', { id: `modact:menu:warnings:${uid}`, label: 'Warnings', emoji: '⚠️' }),
											semanticButton('nav', { id: `modact:menu:mute:${uid}`, label: 'Mute', emoji: '⏰' }),
											semanticButton('nav', { id: `modact:init:kick:${uid}`, label: 'Kick', emoji: '👢' }),
											semanticButton('danger', { id: `modact:init:ban:${uid}`, label: 'Ban', emoji: '🔨' })
										);
										await msg.edit({ components: [buildTopRow()] }).catch(() => {});
									}
								}
							} catch {}
							return;
						}
						// Execute kick/ban with reason (default: no reason)
						const reason = state.reason || "No reason provided";
						if (!isTesting && targetMember) {
							try {
								if (flowAction === "kick") await targetMember.kick(reason);
								else await targetMember.ban({ reason });
							} catch {}
						} else if (!isTesting && !targetMember && flowAction === "ban" && interaction.guild) {
							try { await interaction.guild.members.ban(uid, { reason }); } catch {}
						}
						await sendUserDM(targetMember || targetUser, flowAction === "kick" ? "kicked" : "banned", null, reason);
						await sendModLog(client, targetMember || targetUser, interaction.user, flowAction === "kick" ? "kicked" : "banned", reason, true, null, null);
						pendingPunishments.delete(key);
						await interaction.reply({ content: `${EMOJI_SUCCESS} ${flowAction === "kick" ? "Kick" : "Ban"} issued${isTesting ? " (testing)" : ""}.`, flags: 1<<6 }).catch(() => {});
						// restore original message buttons to top row
						try {
							if (state.originChannelId && state.originMessageId) {
								const channel = await client.channels.fetch(state.originChannelId).catch(() => null);
								const msg = await channel?.messages?.fetch?.(state.originMessageId).catch(() => null);
								if (msg) {
									await msg.edit({ components: [buildTopRow()] }).catch(() => {});
								}
							}
						} catch {}
						return;
					}
				}

				// Warn/mute/unmute actions
				if (act === "addwarn") {
					// Persist a warning and evaluate simple escalation
					ensureStores();
					const store = getStore();
					const arr = Array.isArray(store[uid]) ? store[uid] : [];
					const entry = { moderator: interaction.user.id, reason: null, date: Date.now(), logMsgId: null };
					arr.push(entry);
					store[uid] = arr;
					saveStore();

					const total = arr.length;
					const esc = config.escalation || {};
					const muteT = Math.max(1, Number(esc.muteThreshold || 3));
					const kickT = Math.max(muteT + 1, Number(esc.kickThreshold || 5));
					const muteMs = Number.isFinite(esc.muteDuration) ? esc.muteDuration : 2 * 60 * 60 * 1000;

					let extra = null, durText = null;
					if (total >= kickT) {
						extra = `Due to reaching ${total} warnings, you have been kicked.`;
						if (!isTesting && targetMember) { try { await targetMember.kick(); } catch {} }
					} else if (total >= muteT) {
						extra = `Due to reaching ${total} warnings, you have been muted.`;
						if (!isTesting && targetMember) { try { await targetMember.timeout(Math.min(muteMs, 14*24*60*60*1000)); } catch {} }
						const ms = require("ms"); durText = ms(muteMs, { long: true });
					}
					// remaining line
					let remainingLine = null;
					if (total < muteT) remainingLine = `${muteT - total} warning${muteT - total === 1 ? "" : "s"} remaining until mute`;
					else if (total < kickT) remainingLine = `${kickT - total} warning${kickT - total === 1 ? "" : "s"} remaining until kick`;

					await sendUserDM(targetMember || targetUser, "warned", durText, null, `${remainingLine ? remainingLine+"\n" : ""}${extra || ""}`.trim());
					const combinedReason = extra || null;
					const nxtRemain = remainingLine ? parseInt((remainingLine.match(/^(\d+)/)||[0,0])[1],10)||0 : 0;
					await sendModLog(client, targetMember || targetUser, interaction.user, "warned", combinedReason, true, durText, nxtRemain);
					// Refresh submenu state
					const count = arr.length;
					const rows = [
						new ActionRowBuilder().addComponents(
							semanticButton('nav', { id: `modact:addwarn:${uid}`, label: 'Warn+', emoji: '➕' }),
							semanticButton('nav', { id: `modact:removewarn:${uid}`, label: 'Warn-', emoji: '➖', enabled: count !== 0 }),
							semanticButton('nav', { id: `modact:back:${uid}`, label: 'Back', emoji: '⬅️' })
						)
					];
					await interaction.deferUpdate().catch(() => {});
					try { await interaction.message.edit({ components: rows }); } catch {}
					return;
				}

				if (act === "removewarn") {
					// Remove last warning if exists
					ensureStores();
					const store = getStore();
					const arr = Array.isArray(store[uid]) ? store[uid] : [];
					if (!arr.length) {
						await interaction.deferUpdate().catch(() => {});
						return;
					}
					const removed = arr.pop();
					store[uid] = arr; saveStore();
					// recompute remaining
					const esc = config.escalation || {};
					const muteT = Math.max(1, Number(esc.muteThreshold || 3));
					const kickT = Math.max(muteT + 1, Number(esc.kickThreshold || 5));
					let remainingLine = null;
					if (arr.length < muteT) remainingLine = `${muteT - arr.length} warning${muteT - arr.length === 1 ? "" : "s"} remaining until mute`;
					else if (arr.length < kickT) remainingLine = `${kickT - arr.length} warning${kickT - arr.length === 1 ? "" : "s"} remaining until kick`;
					const nxtRemain = remainingLine ? parseInt((remainingLine.match(/^(\d+)/)||[0,0])[1],10)||0 : 0;
					await sendUserDM(targetMember || targetUser, "warning removed", null, null, null);
					const reasonForLog = remainingLine ? `${removed?.reason || "No reason"}\n\n${remainingLine}` : `${removed?.reason || "No reason"}`;
					await sendModLog(client, targetMember || targetUser, interaction.user, "warning removed", reasonForLog, true, null, nxtRemain);
					const count = arr.length;
					const rows = [
						new ActionRowBuilder().addComponents(
							semanticButton('nav', { id: `modact:addwarn:${uid}`, label: 'Warn+', emoji: '➕' }),
							semanticButton('nav', { id: `modact:removewarn:${uid}`, label: 'Warn-', emoji: '➖', enabled: count !== 0 }),
							semanticButton('nav', { id: `modact:back:${uid}`, label: 'Back', emoji: '⬅️' })
						)
					];
					await interaction.deferUpdate().catch(() => {});
					try { await interaction.message.edit({ components: rows }); } catch {}
					return;
				}

				if (act === "mute") {
					// Apply timeout if possible
					if (!isTesting && targetMember && typeof targetMember.timeout === "function" && Number.isFinite(durMs)) {
						try { await targetMember.timeout(Math.min(durMs, 14 * 24 * 60 * 60 * 1000)); } catch {}
					}
					const ms = require("ms");
					const durText = Number.isFinite(durMs) ? ms(durMs, { long: true }) : null;
					await sendUserDM(targetMember || targetUser, "muted", durText, null);
					await sendModLog(client, targetMember || targetUser, interaction.user, "muted", null, true, durText, null);
					// Refresh mute submenu
					const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
					const rows = [
						new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:3600000`).setLabel("1h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:7200000`).setLabel("2h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:21600000`).setLabel("6h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:86400000`).setLabel("24h").setStyle(ButtonStyle.Danger).setEmoji("⏱️")
						),
						new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`modact:unmute:${uid}`).setLabel("Unmute").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!isTimedOut),
							new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
						)
					];
					await interaction.deferUpdate().catch(() => {});
					try { await interaction.message.edit({ components: rows }); } catch {}
					return;
				}

				if (act === "unmute") {
					if (!isTesting && targetMember) {
						try { if (typeof targetMember.timeout === "function") await targetMember.timeout(null); } catch {}
					}
					await sendUserDM(targetMember || targetUser, "unmuted");
					await sendModLog(client, targetMember || targetUser, interaction.user, "unmuted", null, false, null, null);
					const isTimedOut = !!(targetMember?.communicationDisabledUntilTimestamp && targetMember.communicationDisabledUntilTimestamp > Date.now());
					const rows = [
						new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:3600000`).setLabel("1h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:7200000`).setLabel("2h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:21600000`).setLabel("6h").setStyle(ButtonStyle.Danger).setEmoji("⏱️"),
							new ButtonBuilder().setCustomId(`modact:mute:${uid}:86400000`).setLabel("24h").setStyle(ButtonStyle.Danger).setEmoji("⏱️")
						),
						new ActionRowBuilder().addComponents(
							new ButtonBuilder().setCustomId(`modact:unmute:${uid}`).setLabel("Unmute").setStyle(ButtonStyle.Success).setEmoji("✅").setDisabled(!isTimedOut),
							new ButtonBuilder().setCustomId(`modact:back:${uid}`).setLabel("Back").setStyle(ButtonStyle.Secondary).setEmoji("⬅️")
						)
					];
					await interaction.deferUpdate().catch(() => {});
					try { await interaction.message.edit({ components: rows }); } catch {}
					return;
				}

				if (act === "kick" || act === "ban") {
					// Legacy direct actions not used; route to init flow
					await interaction.deferUpdate().catch(() => {});
					return;
				}

				// Unknown/modact fallthrough
				await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, flags: 1<<6 }).catch(() => {});
				return;
			}

			// StaffTeam Chatbox Button
			if (interaction.isButton() && interaction.customId === CHATBOX_BUTTON_ID) {
				const member = interaction.member;
				const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
				if (!hasRole) {
					await interaction.reply({ content: "You are not allowed to use this", flags: 1<<6 });
					return;
				}
				await interaction.showModal(
					new ModalBuilder()
						.setCustomId("staffteam_chatbox_modal")
						.setTitle("Staff Team Chatbox")
						.addComponents(
							new ActionRowBuilder().addComponents(
								new TextInputBuilder()
									.setCustomId("chatbox_input")
									.setLabel("Type your message")
									.setStyle(TextInputStyle.Paragraph)
									.setRequired(true)
							)
						)
				);
				return;
			}

			// StaffTeam Chatbox Modal Submit
			if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "staffteam_chatbox_modal") {
				const member = interaction.member;
				const hasRole = member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
				if (!hasRole) {
					await interaction.reply({ content: "You are not allowed to use this.", flags: 1<<6 });
					return;
				}
				const messageContent = interaction.fields.getTextInputValue("chatbox_input");
				const channel = await client.channels.fetch("1232701768383729790").catch(() => null);
				if (channel) {
					await channel.send({ content: `💬 **Staff Chatbox Message from <@${member.id}>:**\n${messageContent}` });
				}
				await interaction.reply({ content: "Your message has been sent!", flags: 1<<6 });
				return;
			}

			// Event notification signup button (role toggle)
			if (interaction.isButton() && interaction.customId.startsWith('event_notify_')) {
				const NOTIFY_ROLE_ID = '1380303846877696153';
				const member = interaction.member;
				if (!member) { await interaction.reply({ content: 'Could not resolve member.', flags: 1<<6 }).catch(()=>{}); return; }
				const hasRole = member.roles.cache.has(NOTIFY_ROLE_ID);
				try {
					if (hasRole) {
						await member.roles.remove(NOTIFY_ROLE_ID, 'Toggle event notification subscription');
						await interaction.reply({ content: `Removed role: <@&${NOTIFY_ROLE_ID}>. You will no longer receive notifications for this event.`, flags: 1<<6 }).catch(()=>{});
					} else {
						await member.roles.add(NOTIFY_ROLE_ID, 'Toggle event notification subscription');
						await interaction.reply({ content: `Granted role: <@&${NOTIFY_ROLE_ID}>. You will now be notified whenever this event starts.`, flags: 1<<6 }).catch(()=>{});
					}
					// Removed dynamic label toggle per request: keep the button text constant for all users.
				} catch (e) {
					await interaction.reply({ content: 'Failed to toggle role: '+ (e.message||e), flags: 1<<6 }).catch(()=>{});
				}
				return;
			}

			// Snipe config modal submit (add/remove channel)
			if (
				interaction.type === InteractionType.ModalSubmit &&
				interaction.customId.startsWith("modal_snipe_")
			) {
				const parts = interaction.customId.split("_");
				// modal_snipe_{action}_{messageId}_{category}_{setting}
				const action = parts[2];
				const originMessageId = parts[3];
				const originCategory = parts[4];
				const originSetting = parts[5];
				const raw = interaction.fields.getTextInputValue("channelInput");
				const channelId = (raw || "").replace(/[^0-9]/g, "");
				const channel = interaction.guild?.channels?.cache?.get(channelId);
				if (!channel) {
					await interaction.reply({ content: `${EMOJI_ERROR} Invalid or unknown channel.`, flags: 1<<6 });
					return;
				}

				const mode = config.snipeMode === "blacklist" ? "blacklist" : "whitelist";
				if (mode === "whitelist") {
					if (action === "addChannel") {
						if (!Array.isArray(config.snipingWhitelist)) config.snipingWhitelist = [];
						if (!config.snipingWhitelist.includes(channel.id)) {
							config.snipingWhitelist.push(channel.id);
							saveConfig();
							await interaction.reply({ content: `${EMOJI_SUCCESS} Added <#${channel.id}> to whitelist.`, flags: 1<<6 });
						} else {
							await interaction.reply({ content: `${EMOJI_ERROR} Channel already in whitelist.`, flags: 1<<6 });
						}
					} else if (action === "removeChannel") {
						if (Array.isArray(config.snipingWhitelist) && config.snipingWhitelist.includes(channel.id)) {
							config.snipingWhitelist = config.snipingWhitelist.filter(id => id !== channel.id);
							saveConfig();
							await interaction.reply({ content: `${EMOJI_SUCCESS} Removed <#${channel.id}> from whitelist.`, flags: 1<<6 });
						} else {
							await interaction.reply({ content: `${EMOJI_ERROR} Channel not in whitelist.`, flags: 1<<6 });
						}
					} else {
						await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, flags: 1<<6 });
					}
				} else {
					// blacklist mode uses snipingChannelList
					if (action === "addChannel") {
						if (!Array.isArray(config.snipingChannelList)) config.snipingChannelList = [];
						if (!config.snipingChannelList.includes(channel.id)) {
							config.snipingChannelList.push(channel.id);
							saveConfig();
							await interaction.reply({ content: `${EMOJI_SUCCESS} Added <#${channel.id}> to blacklist.`, flags: 1<<6 });
						} else {
							await interaction.reply({ content: `${EMOJI_ERROR} Channel already in blacklist.`, flags: 1<<6 });
						}
					} else if (action === "removeChannel") {
						if (Array.isArray(config.snipingChannelList) && config.snipingChannelList.includes(channel.id)) {
							config.snipingChannelList = config.snipingChannelList.filter(id => id !== channel.id);
							saveConfig();
							await interaction.reply({ content: `${EMOJI_SUCCESS} Removed <#${channel.id}> from blacklist.`, flags: 1<<6 });
						} else {
							await interaction.reply({ content: `${EMOJI_ERROR} Channel not in blacklist.`, flags: 1<<6 });
						}
					} else {
						await interaction.reply({ content: `${EMOJI_ERROR} Unknown action.`, flags: 1<<6 });
					}
				}
				// Try to refresh the original config menu message embed if visible
				try {
					if (originMessageId && originCategory && originSetting) {
						const msg = await interaction.channel.messages.fetch(originMessageId).catch(() => null);
						if (msg) {
							const { embed, row } = renderSettingEmbed(originCategory, originSetting);
							const components = Array.isArray(row) ? row : [row];
							await msg.edit({ embeds: [embed], components }).catch(() => {});
						}
					}
				} catch {}
				return;
			}

			// Schedule creation modal submit
			if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("schedule_create_modal")) {
				await handleScheduleModal(interaction);
				return;
			}
			// Event creation modal submit (id pattern: event_create_modal_<managerMessageId>)
			if (interaction.type === InteractionType.ModalSubmit && interaction.customId.startsWith("event_create_modal")) {
				await handleEventCreateModal(interaction);
				return;
			}
			if (interaction.type === InteractionType.ModalSubmit && /^event_(times|days|msg|edit)_modal_/.test(interaction.customId)) {
				await handleEventEditModal(interaction);
				return;
			}
			// Auto message notification modals (add / offset / message / channel / unified edit)
			if (interaction.type === InteractionType.ModalSubmit && /^(notif_(add|offset|msg|channel|edit)_modal_)/.test(interaction.customId)) {
				await handleEventNotificationModal(interaction);
				return;
			}

			// Clock-In position select - delegate to exported handler for reuse/testing
			if (interaction.isStringSelectMenu() && interaction.customId.startsWith('clockin:')) {
				await handleClockInSelect(interaction);
				return;
			}

			// Clock-In autoNext register button
			if (interaction.isButton() && interaction.customId.startsWith('clockin:autoNext:')) {
				const parts = interaction.customId.split(':'); // clockin autoNext evId roleKey
				const evId = parts[2];
				const roleKey = parts[3];
				const ev = getEvent(evId);
				if (!ev) { await interaction.reply({ content:'Event missing.', flags:1<<6 }).catch(()=>{}); return; }
				if (roleKey === 'none') { await interaction.reply({ content:'Select a role first.', flags:1<<6 }).catch(()=>{}); return; }
				const clock = ev.__clockIn && typeof ev.__clockIn==='object' ? { ...ev.__clockIn } : { positions:{}, messageIds:[] };
				clock.autoNext = clock.autoNext && typeof clock.autoNext==='object' ? { ...clock.autoNext } : {};
				clock.autoNext[interaction.user.id] = roleKey;
				updateEvent(ev.id, { __clockIn: clock });
				// Immediately re-render embedded clock-in messages to show the star next to the user
				try {
					const { buildClockInEmbed } = require('../utils/clockinTemplate');
					const hydrated = { ...ev, __clockIn: clock };
					const embed = buildClockInEmbed(hydrated);
					const msgTargets = [];
					if (Array.isArray(clock.messageIds)) for (const id of clock.messageIds) msgTargets.push({ id, channelId: clock.channelId || ev.channelId || interaction.channelId });
					if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') for (const rec of Object.values(ev.__notifMsgs || {})) if (rec && Array.isArray(rec.ids)) for (const id of rec.ids) msgTargets.push({ id, channelId: rec.channelId || ev.channelId || interaction.channelId });
					const seen = new Set();
					for (const t of msgTargets) {
						if (!t || !t.id) continue; if (seen.has(t.id)) continue; seen.add(t.id);
						try {
							const ch = t.channelId ? await interaction.client.channels.fetch(t.channelId).catch(()=>null) : interaction.channel;
							const msg = ch && ch.messages ? await ch.messages.fetch(t.id).catch(()=>null) : null;
							if (msg) await msg.edit({ content:'', embeds:[embed] }).catch(()=>{});
						} catch {}
					}
				} catch {}
				await interaction.reply({ content:`You will be auto-registered as ${roleKey.replace(/_/g,' ')} next clock-in.`, flags:1<<6 }).catch(()=>{});
				return;
			}
			// Clock-In autoNext cancel
			if (interaction.isButton() && interaction.customId.startsWith('clockin:autoNextCancel:')) {
				const parts = interaction.customId.split(':');
				const evId = parts[2];
				const ev = getEvent(evId);
				if (!ev) { await interaction.reply({ content:'Event missing.', flags:1<<6 }).catch(()=>{}); return; }
				const clock = ev.__clockIn && typeof ev.__clockIn==='object' ? { ...ev.__clockIn } : { positions:{}, messageIds:[] };
				if (clock.autoNext && clock.autoNext[interaction.user.id]) {
					delete clock.autoNext[interaction.user.id];
					updateEvent(ev.id, { __clockIn: clock });
					// Immediately re-render embedded clock-in messages to remove the star next to the user
					try {
						const { buildClockInEmbed } = require('../utils/clockinTemplate');
						const hydrated = { ...ev, __clockIn: clock };
						const embed = buildClockInEmbed(hydrated);
						const msgTargets = [];
						if (Array.isArray(clock.messageIds)) for (const id of clock.messageIds) msgTargets.push({ id, channelId: clock.channelId || ev.channelId || interaction.channelId });
						if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') for (const rec of Object.values(ev.__notifMsgs || {})) if (rec && Array.isArray(rec.ids)) for (const id of rec.ids) msgTargets.push({ id, channelId: rec.channelId || ev.channelId || interaction.channelId });
						const seen = new Set();
						for (const t of msgTargets) {
							if (!t || !t.id) continue; if (seen.has(t.id)) continue; seen.add(t.id);
							try {
								const ch = t.channelId ? await interaction.client.channels.fetch(t.channelId).catch(()=>null) : interaction.channel;
								const msg = ch && ch.messages ? await ch.messages.fetch(t.id).catch(()=>null) : null;
								if (msg) await msg.edit({ content:'', embeds:[embed] }).catch(()=>{});
							} catch {}
						}
					} catch {}
					await interaction.reply({ content:'Auto registration cancelled.', flags:1<<6 }).catch(()=>{});
				} else {
					await interaction.reply({ content:'No auto registration found.', flags:1<<6 }).catch(()=>{});
				}
				return;
			}
		} catch (err) {
			// Log richer metadata to make live debugging easier: include the interaction customId,
			// user/guild/channel/message ids and a one-line stack when available.
			try {
				const logger = require('../utils/logger');
				const meta = {
					customId: interaction?.customId || null,
					userId: interaction?.user?.id || null,
					guildId: interaction?.guildId || null,
					channelId: interaction?.channelId || null,
					messageId: interaction?.message?.id || null,
					err: err && err.message ? err.message : String(err)
				};
				// Attach a short stack (single-line) if present
				if (err && err.stack) meta.stack = String(err.stack).split('\n')[0];
				logger.error('[Interaction Error]', meta);
			} catch (e) { try { require('../utils/logger').error('[Interaction Error] (logging failed)', { err: e.message }); } catch {} }
			// Best-effort: if configured, post a short high-verbosity message to the configured log channel
			try {
				const { config: cfg } = require('../utils/storage');
				const shouldPost = !!(cfg && (cfg.postInteractionErrorsToLogChannel || cfg.debugMode));
				if (shouldPost) {
					const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
					if (CONFIG_LOG_CHANNEL && interaction?.client?.channels?.fetch) {
						const ch = await interaction.client.channels.fetch(CONFIG_LOG_CHANNEL).catch(()=>null);
						if (ch && typeof ch.send === 'function') {
							const gid = interaction.guildId || 'guild';
							const cid = interaction.channelId || 'channel';
							const mid = interaction.message?.id || '(no message id)';
							const shortStack = err && err.stack ? String(err.stack).split('\n')[0] : (err && err.message ? String(err.message) : String(err));
							const content = `⚠️ [Interaction Error] customId="${interaction?.customId||''}" user=<@${interaction?.user?.id||'unknown'}> guild=${gid} channel=${cid} message=${mid} error=${shortStack}`;
							await ch.send({ content }).catch(()=>{});
						}
					}
				}
			} catch (e) { try { require('../utils/logger').error('[Interaction Error] (post to channel failed)', { err: e.message }); } catch {} }
			// Try to reply with a safe ephemeral message so the interaction is acknowledged.
			try {
				if (typeof interaction.isRepliable === 'function' && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
					await interaction.reply({ content: `An error occurred.\n${err.message || err}`, flags: 1<<6 }).catch(() => {});
				}
			} catch {}
		} finally {
			// Ensure component interactions are acknowledged to avoid the Discord client showing
			// "This interaction failed". Use deferUpdate as a quiet acknowledgement when
			// nothing else has replied or deferred the interaction. Log when we perform the fallback
			// ack so we can correlate with user reports.
			try {
				const isButton = (typeof interaction.isButton === 'function' && interaction.isButton());
				const isSelect = (typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu());
				const isComponent = isButton || isSelect;
				const canReply = (typeof interaction.isRepliable === 'function' ? interaction.isRepliable() : !!interaction.reply);
				if (isComponent && canReply && !interaction.replied && !interaction.deferred) {
					try {
						await interaction.deferUpdate().catch(() => {});
						try { require('../utils/logger').info('[Interaction Fallback Ack]', { customId: interaction?.customId || null, userId: interaction?.user?.id || null }); } catch {}
						// Best-effort: post a short message to log channel when fallback ack runs (helps correlate user-facing failures)
						try {
							const { config: cfg } = require('../utils/storage');
							const shouldPost = !!(cfg && (cfg.postInteractionErrorsToLogChannel || cfg.debugMode));
							if (shouldPost) {
								const { CONFIG_LOG_CHANNEL } = require('../utils/logChannels');
								if (CONFIG_LOG_CHANNEL && interaction?.client?.channels?.fetch) {
									const ch = await interaction.client.channels.fetch(CONFIG_LOG_CHANNEL).catch(()=>null);
									if (ch && typeof ch.send === 'function') {
										const content = `⚠️ [Interaction Fallback Ack] customId="${interaction?.customId||''}" user=<@${interaction?.user?.id||'unknown'}>`;
										await ch.send({ content }).catch(()=>{});
									}
								}
							}
						} catch (e) { try { require('../utils/logger').error('[Interaction Fallback Ack] (post to channel failed)', { err: e.message }); } catch {} }
					} catch {}
				}
			} catch (e) { try { require('../utils/logger').error('[Interaction Fallback Ack Failure]', { err: e.message }); } catch {} }
		}
	});
}

module.exports = { attachInteractionEvents, handleClockInSelect };
