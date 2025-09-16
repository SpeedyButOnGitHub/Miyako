const Tracked = require('./trackedMessages');
const { updateEvent, getEvent, getEvents } = require('./eventsStorage');

async function findCandidateInChannel(client, channel, ev) {
	try {
		if (!channel || !channel.messages || typeof channel.messages.fetch !== 'function') return null;
		let recent = null;
		try {
			recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
		} catch {
			try {
				recent = await channel.messages.fetch().catch(() => null);
			} catch {}
		}
		if (!recent) return null;
		const coll = recent.values ? Array.from(recent.values()) : Array.isArray(recent) ? recent : [];
		// compute token if available to look for deterministic match using encoded zero-width token
		let token = null;
		let tmod = null;
		try {
			tmod = require('./anchorToken');
			token = tmod.generateToken(ev.id);
		} catch {}
		for (const candidate of coll) {
			try {
				if (!candidate) continue;
				if (!candidate.author || String(candidate.author.id) !== String(client.user?.id)) continue;
				const text =
					(candidate.content || '') +
					(candidate.embeds && candidate.embeds[0] ? JSON.stringify(candidate.embeds[0]) : '');
				if (!text) continue;
				// Prefer deterministic token match by decoding any embedded zero-width token
				try {
					if (tmod && typeof tmod.findTokenInText === 'function') {
						const found = tmod.findTokenInText(text);
						if (found && token && String(found) === String(token)) return candidate;
					}
				} catch {}
				if (
					(ev.name && text.includes(ev.name)) ||
					(ev.dynamicBaseContent &&
						text.includes(
							ev.dynamicBaseContent.slice(0, Math.min(80, ev.dynamicBaseContent.length)),
						))
				)
					return candidate;
			} catch {}
		}
	} catch (e) {}
	return null;
}

async function reconcileAll(client, options = { dryRun: false, repair: true }) {
	try {
		const all = Tracked.getAll();
		if (!all || typeof all !== 'object') return;
		const evs = getEvents();
		const report = { checked: 0, missing: 0, reclaimed: 0, recreated: 0, removed: 0, errors: 0 };
		for (const [eventId, rec] of Object.entries(all)) {
			try {
				report.checked++;
				const ev = evs.find((e) => String(e.id) === String(eventId)) || getEvent(eventId);
				if (!ev) {
					if (options.repair && !options.dryRun) Tracked.removeByEvent(eventId);
					report.removed++;
					continue;
				}
				if (!rec || !rec.channelId || !rec.messageId) {
					report.missing++;
					if (options.repair && !options.dryRun)
						await require('../commands/schedule/actions')
							.ensureAnchor(client, ev)
							.catch(() => {});
					if (options.repair && !options.dryRun) report.recreated++;
					continue;
				}
				const channel = await client.channels.fetch(rec.channelId).catch(() => null);
				if (!channel) {
					report.missing++;
					if (options.repair && !options.dryRun) {
						Tracked.removeByEvent(eventId);
						await require('../commands/schedule/actions')
							.ensureAnchor(client, ev)
							.catch(() => {});
						report.removed++;
						report.recreated++;
					}
					continue;
				}
				const msg = await channel.messages.fetch(rec.messageId).catch(() => null);
				if (msg && msg.author && String(msg.author.id) === String(client.user?.id)) {
					// message exists and is ours; ensure it's up to date
					if (options.repair && !options.dryRun)
						await require('../commands/schedule/actions')
							.ensureAnchor(client, ev)
							.catch(() => {});
					continue;
				}
				// try to reclaim a candidate in the channel (token-first)
				let candidate = await findCandidateInChannel(client, channel, ev);
				// If not found, build a broader set of candidate channels from event runtime data
				if (!candidate) {
					try {
						const candidates = [];
						const pushUnique = (id) => {
							if (!id) return;
							if (candidates.includes(String(id))) return;
							candidates.push(String(id));
						};
						// prefer tracked channel first
						if (rec && rec.channelId) pushUnique(rec.channelId);
						// anchor/channel fields
						if (ev.anchorChannelId) pushUnique(ev.anchorChannelId);
						if (ev.channelId) pushUnique(ev.channelId);
						// clock-in runtime channel
						try {
							if (ev.__clockIn && ev.__clockIn.channelId) pushUnique(ev.__clockIn.channelId);
						} catch {}
						// per-notification persisted messages
						try {
							if (ev.__notifMsgs && typeof ev.__notifMsgs === 'object') {
								for (const [_nid, recn] of Object.entries(ev.__notifMsgs)) {
									try {
										if (recn && recn.channelId) pushUnique(recn.channelId);
									} catch {}
								}
							}
						} catch {}
						// autoMessages that specify a channelId
						try {
							if (Array.isArray(ev.autoMessages)) {
								for (const am of ev.autoMessages) {
									try {
										if (am && am.channelId) pushUnique(am.channelId);
									} catch {}
								}
							}
						} catch {}

						// Limit to a reasonable number
						const scanList = candidates.slice(0, 12);
						for (const chId of scanList) {
							try {
								// skip the original channel which we already checked
								if (channel && String(channel.id) === String(chId)) continue;
								const ch = await client.channels.fetch(chId).catch(() => null);
								if (!ch || !ch.messages) continue;
								candidate = await findCandidateInChannel(client, ch, ev);
								if (candidate) {
									// claim candidate
									Tracked.set(eventId, ch.id, candidate.id);
									updateEvent(ev.id, { anchorChannelId: ch.id, anchorMessageId: candidate.id });
									try {
										await require('../commands/schedule/actions')
											.ensureAnchor(client, ev)
											.catch(() => {});
									} catch {}
									break;
								}
							} catch {}
						}
					} catch (e) {}
				}
				if (candidate) {
					continue;
				}
				// Nothing to reclaim: remove tracked entry and optionally recreate
				report.missing++;
				if (options.repair && !options.dryRun) {
					Tracked.removeByEvent(eventId);
					await require('../commands/schedule/actions')
						.ensureAnchor(client, ev)
						.catch(() => {});
					report.removed++;
					report.recreated++;
				}
			} catch (e) {
				report.errors++;
			}
		}
		return report;
	} catch (e) {
		return { errors: 1 };
	}
}

module.exports = { reconcileAll };

module.exports = { reconcileAll };
