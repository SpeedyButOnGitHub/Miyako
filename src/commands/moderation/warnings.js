const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require("discord.js");
const { replyError, EMOJI_SUCCESS } = require("./replies");
const { sendUserDM } = require("./dm");
const { sendModLog } = require("../../utils/modLogs");
const { isModerator } = require("./permissions");
const { config, saveConfig } = require("../../utils/storage");
const theme = require("../../utils/theme");
const { applyFooterWithPagination, paginationRow } = require("../../utils/ui");

const PAGE_SIZE = 10; // users per page in dashboard
const MAX_WARNING_LIST = 6; // entries shown inline in user view

function ensureWarningsMap() {
	if (typeof config.warnings !== "object" || !config.warnings) config.warnings = {};
	if (typeof config.testingWarnings !== "object" || !config.testingWarnings) config.testingWarnings = {};
	if (typeof config.testingSeed !== "object" || !config.testingSeed) config.testingSeed = {};
}

function getStoreKey() {
	return config.testingMode ? "testingWarnings" : "warnings";
}

function getUserWarnings(userId) {
	ensureWarningsMap();
	const key = getStoreKey();
	const store = config[key];
	return Array.isArray(store[userId]) ? store[userId] : [];
}

function setUserWarnings(userId, arr) {
	ensureWarningsMap();
	const key = getStoreKey();
	const store = config[key];
	store[userId] = Array.isArray(arr) ? arr : [];
	saveConfig();
}

function getThresholds() {
	const esc = config.escalation || {};
	const muteT = Math.max(3, Number(esc.muteThreshold || 3));
	const kickT = Math.max(5, Number(esc.kickThreshold || 5));
	return { muteT, kickT };
}

// Determine next punishment label and how many warnings remain to reach it
function getNextPunishmentInfo(total) {
	const { muteT, kickT } = getThresholds();
	if (total < muteT) return { label: "mute", remaining: Math.max(0, muteT - total) };
	if (total < kickT) return { label: "kick", remaining: Math.max(0, kickT - total) };
	return null;
}

// Seed random warnings for testing mode display; persists until explicit edits occur
function maybeSeedTestingData(guild) {
	if (!config.testingMode) return;
	ensureWarningsMap();
	const seed = config.testingSeed || {};
	const hasAny = Object.values(seed).some(arr => Array.isArray(arr) && arr.length);
	if (hasAny) return;

	const members = [...guild.members.cache.values()].filter(m => !m.user.bot);
	const totalPick = Math.min(50, members.length);
	// Sample unique members up to totalPick
	const pool = members.map(m => m.id);
	const chosen = new Set();
	while (chosen.size < totalPick && chosen.size < pool.length) {
		const id = pool[Math.floor(Math.random() * pool.length)];
		chosen.add(id);
	}
	for (const id of chosen) {
		const warns = [];
		const n = 1 + Math.floor(Math.random() * 4);
		for (let j = 0; j < n; j++) {
			warns.push({
				moderator: id,
				reason: ["Spam", "Off-topic", "Rude language", "NSFW", "Disrespect"][Math.floor(Math.random() * 5)],
				date: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
			});
		}
		seed[id] = warns;
	}
	config.testingSeed = seed;
	saveConfig();
}

// Visible warnings in UI: in testing mode prefer explicit testingWarnings, else seeded; otherwise real store
function getVisibleWarnings(userId) {
	ensureWarningsMap();
	if (config.testingMode) {
		const real = config.testingWarnings[userId];
		if (Array.isArray(real) && real.length) return real;
		const seeded = config.testingSeed[userId];
		if (Array.isArray(seeded) && seeded.length) return seeded;
		return [];
	}
	return getUserWarnings(userId);
}

function memberLabel(guild, userId) {
	const member = guild.members.cache.get(userId);
	if (member) return member.displayName || member.user.username || userId;
	const user = guild.client.users.cache.get(userId);
	return user?.username || userId;
}

function formatWarnLine(guild, entry, idx) {
	const ordinal = (n) => {
		const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]);
	};
	const by = entry.moderator ? `<@${entry.moderator}>` : "Unknown";
	const when = entry.date ? `<t:${Math.floor(entry.date / 1000)}:R>` : "Unknown";
	const reason = (entry.reason || "No reason").slice(0, 140);
	const label = `${ordinal(idx)} Warning`;
	const gId = guild?.id;
	const chId = entry.logChannelId || null;
	const msgId = entry.logMsgId || null;
	const link = (gId && chId && msgId) ? `https://discord.com/channels/${gId}/${chId}/${msgId}` : null;
	const title = link ? `[${label}](${link})` : label;
	return `${title} • by ${by} • ${when}\n${reason}`;
}

function buildDashboardEmbed(guild, page) {
	ensureWarningsMap();
	maybeSeedTestingData(guild);
	const usersSet = new Set();
	if (config.testingMode) {
		Object.keys(config.testingSeed || {}).forEach(k => usersSet.add(k));
		Object.keys(config.testingWarnings || {}).forEach(k => usersSet.add(k));
	} else {
		Object.keys(config.warnings || {}).forEach(k => usersSet.add(k));
	}
	const all = [...usersSet].map(userId => ({ userId, count: getVisibleWarnings(userId).length }))
		.filter(x => x.count > 0)
		.sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId));

	const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
	const curPage = Math.min(Math.max(1, page || 1), totalPages);
	const slice = all.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

	const lines = slice.length
		? slice.map((x, i) => {
				const idx = (i + 1) + (curPage - 1) * PAGE_SIZE;
				// Use mentions for uniformity with the rest; allowedMentions are disabled when replying
				return `${idx}. <@${x.userId}> • ${x.count} warning${x.count === 1 ? "" : "s"}`;
			}).join("\n")
		: "No users currently have warnings.";

	const { muteT, kickT } = getThresholds();
	const embed = new EmbedBuilder()
		.setTitle(`${theme.emojis.warn} Warning Dashboard`)
		.setColor(theme.colors.primary)
		.setDescription(lines);
	applyFooterWithPagination(embed, guild, { testingMode: config.testingMode, page: curPage, totalPages, extra: `Mute at ${muteT} • Kick at ${kickT}` });

	// Per-user select for simpler navigation
	const userOptions = slice.map(x => ({
		label: memberLabel(guild, x.userId).slice(0, 100),
		description: `${x.count} warning${x.count === 1 ? "" : "s"}`,
		value: x.userId
	}));

	const rows = [];
	// User selector row
		rows.push(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`warns:selectUser:${curPage}`)
			.setPlaceholder(userOptions.length ? "Select a user to view" : "No users to select")
			.setMinValues(1)
			.setMaxValues(1)
			.addOptions(userOptions.length ? userOptions : [{ label: "No users", value: "noop", default: true }])
			.setDisabled(!userOptions.length)
	));
	// Shared pagination row (always present for consistency; disabled internally if not needed)
		rows.push(paginationRow(`warns:dash:${curPage}`, curPage, totalPages));
	return { embed, rows, page: curPage, totalPages };
}

function buildUserView(guild, userId, page = 1, opts = {}) {
	const includeBack = opts.includeBack !== undefined ? opts.includeBack : true;
	ensureWarningsMap();
	maybeSeedTestingData(guild);
	const arr = getVisibleWarnings(userId);
	const memberName = memberLabel(guild, userId);
	const total = arr.length;

	const start = (page - 1) * MAX_WARNING_LIST;
	const chunk = arr.slice(start, start + MAX_WARNING_LIST);
	const totalPages = Math.max(1, Math.ceil(total / MAX_WARNING_LIST));

	const baseDesc = total ? chunk.map((e, i) => formatWarnLine(guild, e, start + i + 1)).join("\n\n") : "This user has no warnings.";
	const nxt = getNextPunishmentInfo(total);
	const disclaimer = nxt ? `${nxt.remaining} warning${nxt.remaining === 1 ? "" : "s"} remaining until ${nxt.label}` : null;
	const { muteT, kickT } = getThresholds();
	const embed = new EmbedBuilder()
		.setTitle(`${theme.emojis.warn} Warnings — ${memberName}`)
		.setColor(theme.colors.primary)
		.setDescription([baseDesc, disclaimer].filter(Boolean).join("\n\n"));
	applyFooterWithPagination(embed, guild, { testingMode: config.testingMode, page: Math.min(page, totalPages), totalPages, extra: `Total: ${total} • Mute at ${muteT} • Kick at ${kickT}` });

	const rows = [];
	// Pagination row first
		rows.push(paginationRow(`warns:user:${userId}:${page}`, page, totalPages));
	// Actions row
	const actions = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`warns:add:${userId}`).setLabel("Add Warning").setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(`warns:remove:${userId}`).setLabel("Remove Warning").setStyle(ButtonStyle.Secondary).setDisabled(!total)
	);
		if (includeBack) actions.addComponents(new ButtonBuilder().setCustomId("warns:user:back").setLabel("Back to list").setStyle(ButtonStyle.Secondary));
	rows.push(actions);
	return { embed, rows, total, totalPages, page };
}

async function showWarnings(client, message, targetUserId = null) {
	const guild = message.guild;
	if (!guild) return;
	maybeSeedTestingData(guild);
	if (targetUserId) {
		const view = buildUserView(guild, targetUserId, 1, { includeBack: false });
		await message.reply({ embeds: [view.embed], components: view.rows, allowedMentions: { parse: [] } });
		return;
	}
	const dash = buildDashboardEmbed(guild, 1);
	await message.reply({ embeds: [dash.embed], components: dash.rows, allowedMentions: { parse: [] } });
}

async function handleWarningsCommand(client, message) {
	if (!isModerator(message.member)) return replyError(message, "You are not allowed to use this command.");
	ensureWarningsMap();
	const mentioned = message.mentions.members.first();
	const argId = message.content.split(/\s+/)[1]?.replace(/[^0-9]/g, "");
	const targetId = mentioned?.id || argId || null;
	await showWarnings(client, message, targetId);
}

function buildRemoveSelect(guild, userId) {
	const arr = getVisibleWarnings(userId);
	const opts = arr.slice(0, 25).map((e, idx) => ({
		label: `#${idx + 1} — ${(e.reason || "No reason").slice(0, 90)}`,
		description: `${memberLabel(guild, e.moderator || "?")} • ${e.date ? new Date(e.date).toLocaleDateString() : "Unknown"}`,
		value: String(idx)
	}));
		const row = new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`warns:removePick:${userId}`)
			.setPlaceholder("Select warning(s) to remove")
			.setMinValues(1)
			.setMaxValues(Math.max(1, Math.min(25, opts.length)))
			.addOptions(opts.length ? opts : [{ label: "No warnings", value: "noop", default: true }])
			.setDisabled(!opts.length)
	);
	return row;
}

async function handleWarningButtons(client, interaction) {
	// Route both buttons and selects and modal submits starting with warns:
	try {
		if (interaction.isButton()) {
			const id = interaction.customId;
			const isRelevant = id.startsWith("warns:");
			if (!isRelevant) return;

			// Dashboard pagination
					if (id.startsWith("warns:dash:")) {
						const m = id.match(/^warns:dash:(\d+)_(prev|next|page)$/);
				if (m) {
					const cur = Number(m[1]) || 1;
					const action = m[2];
					if (action === 'prev' || action === 'next') {
						const page = action === 'prev' ? Math.max(1, cur - 1) : cur + 1;
						const dash = buildDashboardEmbed(interaction.guild, page);
						await interaction.update({ embeds: [dash.embed], components: dash.rows }).catch(() => {});
					} else {
						await interaction.deferUpdate().catch(() => {});
					}
					return;
				}
			}
	// User view pagination
					if (id.startsWith("warns:user:")) {
						const m = id.match(/^warns:user:(\d+):(\d+)_(prev|next|page)$/);
				if (m) {
					const userId = m[1];
					const cur = Number(m[2]) || 1;
					const action = m[3];
					if (action === 'prev' || action === 'next') {
						const page = action === 'prev' ? Math.max(1, cur - 1) : cur + 1;
						const view = buildUserView(interaction.guild, userId, page);
						await interaction.update({ embeds: [view.embed], components: view.rows }).catch(() => {});
					} else {
						await interaction.deferUpdate().catch(() => {});
					}
					return;
				}
			}

					if (id === "warns:user:back") {
				const dash = buildDashboardEmbed(interaction.guild, 1);
				await interaction.update({ embeds: [dash.embed], components: dash.rows }).catch(() => {});
				return;
			}
					if (id.startsWith("warns:add:")) {
						const userId = id.substring("warns:add:".length);
				const modal = new ModalBuilder()
							.setCustomId(`warns:add:${userId}`)
					.setTitle("Add warning");
				modal.addComponents(
					new ActionRowBuilder().addComponents(
						new TextInputBuilder().setCustomId("reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400)
					)
				);
				await interaction.showModal(modal);
				return;
			}
					if (id.startsWith("warns:remove:")) {
						const userId = id.substring("warns:remove:".length);
				const view = buildUserView(interaction.guild, userId, 1);
				const selectRow = buildRemoveSelect(interaction.guild, userId);
				const rows = [selectRow, ...view.rows];
				await interaction.update({ embeds: [view.embed], components: rows }).catch(() => {});
				return;
			}
			return;
		}

		if (interaction.isStringSelectMenu() && interaction.customId.startsWith("warns:")) {
			const id = interaction.customId;
					if (id.startsWith("warns:selectUser:")) {
				const uid = interaction.values?.[0] || "";
				if (!uid || uid === "noop") { await interaction.deferUpdate().catch(() => {}); return; }
				const view = buildUserView(interaction.guild, uid, 1);
				await interaction.update({ embeds: [view.embed], components: view.rows }).catch(() => {});
				return;
			}
					if (id.startsWith("warns:removePick:")) {
						const userId = id.substring("warns:removePick:".length);
				const idxs = (interaction.values || []).map(v => Number(v)).filter(n => Number.isInteger(n));
				ensureWarningsMap();
				// If only seeded exists in testing, copy it to explicit store before modifying
				let arr = getUserWarnings(userId);
				if (config.testingMode && (!Array.isArray(arr) || arr.length === 0)) {
					const vis = getVisibleWarnings(userId);
					arr = Array.isArray(vis) ? vis.map(x => ({ moderator: x.moderator, reason: x.reason, date: x.date })) : [];
				}
				const removed = [];
				// Remove from highest index to lowest
				idxs.sort((a, b) => b - a);
				for (const i of idxs) if (i >= 0 && i < arr.length) removed.push(arr.splice(i, 1)[0]);
				setUserWarnings(userId, arr);
	// Aggregate DM and log for removals
	const count = removed.length;
	const actionText = count > 1 ? `Warning removed x${count}` : `Warning removed`;
	const lastReason = removed[0]?.reason || "No reason";
	const nxt = getNextPunishmentInfo(arr.length);
	const remainingNum = nxt ? nxt.remaining : 0;
	const remLine = nxt ? `${nxt.remaining} warning${nxt.remaining === 1 ? "" : "s"} remaining until ${nxt.label}` : null;
	// Resolve target for DM/log
	let target = interaction.guild.members.cache.get(userId) || interaction.client.users.cache.get(userId);
	if (!target) target = await interaction.client.users.fetch(userId).catch(() => null);
	try { if (target) await sendUserDM(target, actionText, null, null, null); } catch {}
	try { if (target) await sendModLog(interaction.client, target, interaction.user, actionText, remLine ? `${lastReason}\n\n${remLine}` : `${lastReason}`, true, null, remainingNum); } catch {}
				const view = buildUserView(interaction.guild, userId, 1);
				// Update the message and send a hidden confirmation
				await interaction.update({ embeds: [view.embed], components: view.rows }).catch(() => {});
	try { await interaction.followUp({ content: `${EMOJI_SUCCESS} Removed ${count} warning${count === 1 ? "" : "s"}.`, flags: 1<<6 }); } catch {}
				return;
			}
			return;
		}

		if (interaction.isUserSelectMenu && interaction.isUserSelectMenu() && interaction.customId.startsWith("warns:")) {
			const parts = interaction.customId.split(":");
			if (parts[1] === "uselect") {
				const userId = interaction.values?.[0];
				if (!userId) { await interaction.deferUpdate().catch(() => {}); return; }
				const view = buildUserView(interaction.guild, userId, 1);
				await interaction.update({ embeds: [view.embed], components: view.rows }).catch(() => {});
				return;
			}
		}

			if (interaction.isModalSubmit() && interaction.customId.startsWith("warns:add:")) {
				const userId = interaction.customId.substring("warns:add:".length);
			const reason = interaction.fields.getTextInputValue("reason").trim() || "No reason provided";
	ensureWarningsMap();
	// In testing mode, avoid carrying over seeded items; start explicit list
	let arr = getUserWarnings(userId);
	if (config.testingMode && (!Array.isArray(arr) || arr.length === 0)) arr = [];
	const entry = { moderator: interaction.user.id, reason, date: Date.now(), logMsgId: null, logChannelId: null };
	arr.push(entry);
	setUserWarnings(userId, arr);

			const member = interaction.guild.members.cache.get(userId) || null;
			const target = member || (await interaction.client.users.fetch(userId).catch(() => null));
			// DM user and log (escalation handled elsewhere if configured)
			const nxt = getNextPunishmentInfo(arr.length);
			const adExtra = nxt ? `${nxt.remaining} warning${nxt.remaining === 1 ? "" : "s"} remaining until ${nxt.label}` : null;
			try { await sendUserDM(target, "warned", null, reason, adExtra); } catch {}
			try {
				const nxtRemain = nxt ? nxt.remaining : 0;
				// Do not include remaining line in warn logs; pass remaining separately for context
				const msg = await sendModLog(interaction.client, target, interaction.user, "warned", `${reason}`, true, null, nxtRemain);
				if (msg) { entry.logMsgId = msg.id; entry.logChannelId = msg.channelId; saveConfig(); }
			} catch {}

			// Update the original message if possible
			try {
				const view = buildUserView(interaction.guild, userId, 1);
				if (interaction.message && interaction.message.edit) {
					await interaction.message.edit({ embeds: [view.embed], components: view.rows }).catch(() => {});
					await interaction.reply({ content: `${EMOJI_SUCCESS} Warning added.`, flags: 1<<6 });
				} else {
					await interaction.reply({ embeds: [view.embed], components: view.rows, flags: 1<<6 });
				}
			} catch {
	await interaction.reply({ content: `${EMOJI_SUCCESS} Warning added.`, flags: 1<<6 }).catch(() => {});
			}
			return;
		}
	} catch (err) {
		console.error("[Warnings Interaction Error]", err);
		try {
			if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
	await interaction.reply({ content: `An error occurred. ${err.message || err}`, flags: 1<<6 });
			}
		} catch {}
	}
}

function cleanWarnings(userId = null) {
	ensureWarningsMap();
	if (userId) {
		const arr = config.warnings[userId];
		if (!Array.isArray(arr) || arr.length === 0) delete config.warnings[userId];
	} else {
		for (const [uid, arr] of Object.entries(config.warnings)) {
			if (!Array.isArray(arr) || arr.length === 0) delete config.warnings[uid];
		}
	}
	saveConfig();
}

module.exports = {
	showWarnings,
	cleanWarnings,
	handleWarningsCommand,
	handleWarningButtons
};
