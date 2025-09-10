const { addSchedule, updateSchedule, getSchedules } = require("./scheduleStorage");
const { getEvents, updateEvent } = require("./eventsStorage");
const { applyTimestampPlaceholders } = require('./timestampPlaceholders');
const { config } = require('./storage');
const ms = require("ms");
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const theme = require('./theme');
const { createEmbed } = require('./embeds');
const { CONFIG_LOG_CHANNEL } = require('./logChannels');
const { buildClockInEmbed } = require('./clockinEmbed');

function applyPlaceholdersToJsonPayload(payload, ev) {
	if (!payload || typeof payload !== 'object') return payload;
	const repl = (s) => applyTimestampPlaceholders(String(s), ev);
	const sanitize = (s) => (config.testingMode ? String(s).replace(/<@&?\d+>/g, m=>`\`${m}\``) : s);
	const fixStr = (s) => sanitize(repl(s));
	const copy = { ...payload };
	if (typeof copy.content === 'string') copy.content = fixStr(copy.content).slice(0, 2000);
	if (Array.isArray(copy.embeds)) {
		copy.embeds = copy.embeds.map(e => {
			if (!e || typeof e !== 'object') return e;
			const ee = { ...e };
			if (typeof ee.title === 'string') ee.title = fixStr(ee.title);
			if (typeof ee.description === 'string') ee.description = fixStr(ee.description);
			if (ee.footer && typeof ee.footer.text === 'string') ee.footer = { ...ee.footer, text: fixStr(ee.footer.text) };
			if (ee.author && typeof ee.author.name === 'string') ee.author = { ...ee.author, name: fixStr(ee.author.name) };
			if (Array.isArray(ee.fields)) ee.fields = ee.fields.map(f => {
				if (!f || typeof f !== 'object') return f;
				const ff = { ...f };
				if (typeof ff.name === 'string') ff.name = fixStr(ff.name).slice(0, 256);
				if (typeof ff.value === 'string') ff.value = fixStr(ff.value).slice(0, 1024);
				return ff;
			});
			return ee;
		});
	}
	return copy;
}

function parseTimeToMsToday(timeStr) {
	const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
	const now = new Date();
	const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh || 0, mm || 0, 0, 0);
	return t.getTime();
}

function computeNextRun(schedule) {
	const now = Date.now();
	const type = schedule.type || "once";

	const timeMsOfDay = (() => {
		if (!schedule.time) return 0;
		const [hh = 0, mm = 0] = schedule.time.split(":").map(Number);
		return hh * 3600000 + (mm || 0) * 60000;
	})();

	if (type === "once") {
		if (schedule.date && schedule.time) {
			const [y, m, d] = schedule.date.split("-").map(Number);
			const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
			const next = new Date(y, (m || 1) - 1, d || 1, hh, mm, 0, 0);
			const ts = next.getTime();
			return ts > now ? ts : null; // if time is in the past, do not reschedule
		}
		return schedule.nextRun || null;
	}

	if (type === "daily") {
		let candidate = new Date();
		candidate.setHours(...((schedule.time || "00:00").split(":").map(Number)), 0, 0);
		if (candidate.getTime() <= now) candidate = new Date(candidate.getTime() + 24 * 3600000);
		return candidate.getTime();
	}

	if (type === "interval") {
		if (schedule.nextRun && schedule.nextRun > now) return schedule.nextRun;
		const days = Math.max(1, Number(schedule.intervalDays) || 1);
		const base = schedule.nextRun && schedule.nextRun > 0 ? schedule.nextRun : now;
		return new Date(base + days * 24 * 3600000).getTime();
	}

	if (type === "weekly") {
		const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [1];
		const nowDate = new Date();
		const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
		for (let offset = 0; offset < 14; offset++) {
			const d = new Date(nowDate.getTime() + offset * 24 * 3600000);
			const wd = d.getDay();
			if (days.includes(wd)) {
				const candidate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0);
				if (candidate.getTime() > now) return candidate.getTime();
			}
		}
		return now + 24 * 3600000;
	}

	if (type === "monthly") {
		const day = Math.max(1, Number(schedule.dayOfMonth) || 1);
		const [hh = 0, mm = 0] = (schedule.time || "00:00").split(":").map(Number);
		const base = new Date();
		const year = base.getFullYear();
		const month = base.getMonth();
		const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
		const dom = Math.min(day, lastDayThisMonth);
		let candidate = new Date(year, month, dom, hh, mm, 0, 0);
		if (candidate.getTime() <= now) {
			const nextMonth = month + 1;
			const lastDayNextMonth = new Date(year, nextMonth + 1, 0).getDate();
			const dom2 = Math.min(day, lastDayNextMonth);
			const next = new Date(year, nextMonth, dom2, hh, mm, 0, 0);
			return next.getTime();
		}
		return candidate.getTime();
	}

	return null;
}

async function runScheduleOnce(client, schedule) {
	try {
		const chId = config.testingMode ? (schedule.logChannelId || CONFIG_LOG_CHANNEL || schedule.channelId) : schedule.channelId;
		const channel = await client.channels.fetch(chId).catch(() => null);
		if (!channel || !channel.send) throw new Error("Invalid channel");
		try {
			const { seenRecently } = require('./sendOnce');
			const key = `sched:${schedule.id}:${chId}`;
			if (seenRecently(key, 8000)) return;
		} catch {}
		let content = '';
		if (schedule.messageJSON && typeof schedule.messageJSON === 'object') {
			let payload = { ...schedule.messageJSON };
			if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
			payload = applyPlaceholdersToJsonPayload(payload, schedule.eventRef || {});
			await channel.send(payload);
		} else {
			const raw = schedule.message || 'Scheduled message';
			content = applyTimestampPlaceholders(raw, schedule.eventRef || {});
			if (config.testingMode && content) content = content.replace(/<@&?\d+>/g, m=>`\`${m}\``);
			await channel.send({ content });
		}
		console.log(`Scheduled message sent for schedule ${schedule.id}`);
	} catch (err) {
		console.error("Failed to send scheduled message:", err);
	}
}

function computeAfterRun(schedule) {
	if (schedule.repeats !== null && typeof schedule.repeats !== "undefined") {
		schedule.repeats = Number(schedule.repeats) - 1;
		if (schedule.repeats <= 0) {
			schedule.enabled = false;
			schedule.nextRun = null;
			return schedule;
		}
	}
	if ((schedule.type || 'once') === 'once') {
		schedule.enabled = false;
		schedule.nextRun = null;
		return schedule;
	}
	schedule.nextRun = computeNextRun(schedule);
	return schedule;
}

function startScheduler(client, opts = {}) {
	const tickInterval = opts.intervalMs || 15 * 1000;
	const CLOCKIN_DEDUP_MS = Number(process.env.CLOCKIN_DEDUP_MS) || opts.clockInDedupMs || (5 * 60 * 1000);
	const CLOCKIN_ORPHAN_MAX = Number(process.env.CLOCKIN_ORPHAN_MAX) || 10;

	const schedules = getSchedules();
	for (const s of schedules) {
		if (!s.nextRun || s.nextRun < Date.now()) {
			const nr = computeNextRun(s);
			if (nr) updateSchedule(s.id, { nextRun: nr });
		}
	}

	setInterval(async () => {
		const list = getSchedules();
		const now = Date.now();
		for (const schedule of list) {
			try {
				if (!schedule.enabled) continue;
				if (!schedule.nextRun) {
					const nr = computeNextRun(schedule);
					await updateSchedule(schedule.id, { nextRun: nr });
					continue;
				}
				if (schedule.nextRun <= now + 5000) {
					await runScheduleOnce(client, schedule);
					const after = computeAfterRun({ ...schedule });
					await updateSchedule(schedule.id, after);
				}
			} catch (err) {
				console.error("Scheduler loop error for schedule", schedule.id, err);
			}
		}
		try {
			const events = getEvents();
			const nowDt = new Date();
			const currentDay = nowDt.getDay();
			const hh = nowDt.getHours().toString().padStart(2, "0");
			const mm = nowDt.getMinutes().toString().padStart(2, "0");
			const currentHM = `${hh}:${mm}`;
			for (const ev of events) {
				if (!ev.enabled) continue;
				if (ev.type !== "multi-daily") continue;
				if (Array.isArray(ev.days) && ev.days.length && !ev.days.includes(currentDay)) continue;
				if (!Array.isArray(ev.times)) continue;
				const now = Date.now();
				const hasAnchor = ev.anchorMessageId && ev.anchorChannelId;
				let status = 'upcoming';
				let activeRange = null;
				if (Array.isArray(ev.ranges) && ev.ranges.length) {
					for (const r of ev.ranges) {
						if (!r || !r.start || !r.end) continue;
						const [sh, sm] = r.start.split(':').map(n=>parseInt(n,10));
						const [eh, em] = r.end.split(':').map(n=>parseInt(n,10));
						if ([sh,sm,eh,em].some(n => Number.isNaN(n))) continue;
						const startMinutes = sh*60+sm;
						const endMinutes = eh*60+em;
						const curMinutes = parseInt(hh,10)*60+parseInt(mm,10);
						if (curMinutes >= startMinutes && curMinutes < endMinutes) { status='open'; activeRange = r; break; }
						if (curMinutes >= endMinutes) { status='closed'; }
					}
				} else {
					if (ev.times.includes(currentHM)) {
						const lastKey = `__lastFired_${currentHM}`;
						if (!(ev[lastKey] && now - ev[lastKey] < 60000)) {
							try {
								const channel = await client.channels.fetch(ev.channelId).catch(() => null);
								if (channel && channel.send && !hasAnchor) {
									if (ev.messageJSON && typeof ev.messageJSON === 'object') {
										const payload = { ...ev.messageJSON };
										if (!payload.content && !payload.embeds) payload.content = ev.message || `Event: ${ev.name}`;
										if (payload.content && payload.content.length > 2000) payload.content = payload.content.slice(0,1997)+'...';
										if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
										await channel.send(payload).catch(()=>{});
									} else {
										await channel.send({ content: ev.message || `Event: ${ev.name}` }).catch(()=>{});
									}
								}
							} catch (e) { console.error('Event dispatch failed', ev.id, e); }
							ev[lastKey] = now; updateEvent(ev.id, { [lastKey]: now });
						}
					}
				}
				if (hasAnchor) {
					try {
						const channel = await client.channels.fetch(ev.anchorChannelId).catch(()=>null);
						if (channel) {
							const msg = await channel.messages.fetch(ev.anchorMessageId).catch(()=>null);
							if (msg) {
								let baseContent = ev.dynamicBaseContent || ev.messageJSON?.content || ev.message || '';
								baseContent = applyTimestampPlaceholders(baseContent, ev);
								if (!baseContent) baseContent = `Event: ${ev.name}`;
								let newContent = baseContent;
								const OPEN_TOKEN = /^(# The Midnight bar is.*|🍷The Midnight Bar is currently open!🍷|The Midnight Bar is closed for now\.)$/im;
								if (status === 'open') {
									newContent = newContent.replace(OPEN_TOKEN, '🍷The Midnight Bar is currently open!🍷');
								} else if (status === 'closed') {
									try {
										const { computeNextRange } = require('./timestampPlaceholders');
										const next = computeNextRange(ev);
										if (next && OPEN_TOKEN.test(newContent)) {
											newContent = newContent.replace(OPEN_TOKEN, `# The Midnight bar is opening: <t:${next.startSec}:R>`);
										} else if (OPEN_TOKEN.test(newContent)) {
											newContent = newContent.replace(OPEN_TOKEN, '# The Midnight bar is opening: (soon)');
										}
									} catch {
										if (OPEN_TOKEN.test(newContent)) newContent = newContent.replace(OPEN_TOKEN, '# The Midnight bar is opening: (soon)');
									}
								} else if (status === 'upcoming') {
									try {
										const { computeNextRange } = require('./timestampPlaceholders');
										const range = computeNextRange(ev);
										if (range && OPEN_TOKEN.test(newContent)) {
											const relTs = `<t:${range.startSec}:R>`;
											newContent = newContent.replace(OPEN_TOKEN, `# The Midnight bar is opening in ${relTs}`);
										}
									} catch {}
								}
								if (newContent !== msg.content) {
									if (ev.messageJSON) {
										const payload = { ...ev.messageJSON, content: newContent };
										if (payload.embeds && !Array.isArray(payload.embeds)) payload.embeds = [payload.embeds];
										await msg.edit(payload).catch(()=>{});
									} else {
										await msg.edit({ content: newContent }).catch(()=>{});
									}
								}
							}
						}
					} catch (e) { /* ignore anchor update errors */ }
				}
				try {
					if (ev.__clockIn && Array.isArray(ev.__clockIn.messageIds)) {
						const pruneInterval = 5 * 60 * 1000;
						const nowTs = Date.now();
						if (!ev.__clockIn.lastPruneTs || (nowTs - ev.__clockIn.lastPruneTs) > pruneInterval) {
							const chId = ev.__clockIn.channelId || ev.channelId;
							const channel = chId ? await client.channels.fetch(chId).catch(()=>null) : null;
							if (channel && channel.messages) {
								const kept = [];
								for (const mid of ev.__clockIn.messageIds.slice(-10)) {
									const exists = await channel.messages.fetch(mid).then(()=>true).catch(()=>false);
									if (exists) kept.push(mid);
								}
								if (kept.length !== ev.__clockIn.messageIds.length) {
									ev.__clockIn.messageIds = kept;
									ev.__clockIn.lastPruneTs = nowTs;
									updateEvent(ev.id, { __clockIn: ev.__clockIn });
								} else {
									ev.__clockIn.lastPruneTs = nowTs;
									updateEvent(ev.id, { __clockIn: ev.__clockIn });
								}
							}
						}
					}
				} catch {}
			}
		} catch (e) { /* ignore event errors */ }
	}, tickInterval);
}

module.exports = {
	startScheduler,
	computeNextRun,
	computeAfterRun
};
