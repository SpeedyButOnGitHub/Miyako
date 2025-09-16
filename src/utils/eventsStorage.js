const fs = require('fs');
const path = require('path');
const { runtimeFile } = require('./paths');

const EVENTS_FILE = runtimeFile('events.json');
const { recordEventChannel } = require('./channelIdLog');
const { getRuntime, setRuntime } = require('./eventsRuntimeLog');
const { enqueueWrite } = require('./writeQueue');

function ensureFile() {
	const dir = path.dirname(EVENTS_FILE);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(EVENTS_FILE)) {
		const initial = { nextId: 1, events: [] };
		fs.writeFileSync(EVENTS_FILE, JSON.stringify(initial, null, 2));
	}
}

function loadObj() {
	ensureFile();
	try {
		let raw = fs.readFileSync(EVENTS_FILE, 'utf8');
		// Attempt to heal common JSON mistakes (trailing commas) before parse
		try {
			// Remove trailing commas before } or ]
			raw = raw.replace(/,\s*([}\]])/g, '$1');
		} catch {}
		const data = JSON.parse(raw);
		if (!Array.isArray(data.events)) data.events = [];
		if (typeof data.nextId !== 'number') data.nextId = 1;
		return data;
	} catch {
		return { nextId: 1, events: [] };
	}
}

function saveObj(obj) {
	ensureFile();
	enqueueWrite(EVENTS_FILE, () => JSON.stringify(obj, null, 2), { aggregateBackups: true });
}

function mergeRuntime(ev) {
	if (!ev) return ev;
	const rt = getRuntime(ev.id) || {};
	const merged = { ...ev, ...rt };
	// Ensure a safe __clockIn shape so callers can rely on positions/messageIds
	if (!merged.__clockIn || typeof merged.__clockIn !== 'object')
		merged.__clockIn = { positions: {}, messageIds: [] };
	else {
		if (!merged.__clockIn.positions || typeof merged.__clockIn.positions !== 'object')
			merged.__clockIn.positions = {};
		if (!Array.isArray(merged.__clockIn.messageIds)) merged.__clockIn.messageIds = [];
	}
	return merged;
}

function getEvents() {
	return loadObj().events.map(mergeRuntime);
}

function getEvent(id) {
	id = String(id);
	const base = loadObj().events.find((e) => String(e.id) === id) || null;
	if (base) return mergeRuntime(base);
	// Fallback: if base is missing but runtime exists (e.g., in tests or transient states), return a runtime-only view
	try {
		const rt = getRuntime(id);
		if (rt && typeof rt === 'object') {
			return mergeRuntime({ id, ...rt });
		}
	} catch {}
	return null;
}
function sanitize(ev) {
	// Strip channelId & volatile runtime fields before persisting to events.json
	const {
		channelId,
		anchorChannelId,
		anchorMessageId,
		__notifMsgs,
		__clockIn,
		dynamicBaseContent,
		...rest
	} = ev;
	// Remove any __auto_* markers
	for (const k of Object.keys(rest)) if (/^__auto_/.test(k)) delete rest[k];
	return rest;
}

function addEvent(ev) {
	const obj = loadObj();
	const id = String(obj.nextId++);
	const withId = { id, ...ev };
	// Persist sans channelId
	obj.events.push(sanitize(withId));
	saveObj(obj);
	if (withId.channelId) recordEventChannel(id, withId.channelId);
	// Store runtime subset
	const { anchorChannelId, anchorMessageId, __notifMsgs, __clockIn, dynamicBaseContent } = withId;
	setRuntime(id, { anchorChannelId, anchorMessageId, __notifMsgs, __clockIn, dynamicBaseContent });
	return withId; // full runtime object
}

function updateEvent(id, patch) {
	id = String(id);
	const obj = loadObj();
	const i = obj.events.findIndex((e) => String(e.id) === id);
	if (i === -1) return null;
	const current = obj.events[i];
	const merged = { ...current, ...patch };
	obj.events[i] = sanitize(merged);
	saveObj(obj);
	if (patch.channelId) recordEventChannel(id, patch.channelId);
	// Persist runtime specific patch
	const runtimePatch = {};
	for (const k of [
		'anchorChannelId',
		'anchorMessageId',
		'__notifMsgs',
		'__clockIn',
		'dynamicBaseContent',
	])
		if (k in patch) runtimePatch[k] = patch[k];
	if (Object.keys(runtimePatch).length) {
		try {
			// Defensive merge for nested runtime keys (especially __clockIn.positions) so
			// callers that write partial updates don't accidentally wipe other runtime state.
			const curRt = getRuntime(id) || {};
			// Merge __clockIn carefully: preserve existing positions and only overwrite keys provided in the patch.
			if (runtimePatch.__clockIn && typeof runtimePatch.__clockIn === 'object') {
				const curClock =
					curRt.__clockIn && typeof curRt.__clockIn === 'object' ? { ...curRt.__clockIn } : {};
				const patchClock = { ...runtimePatch.__clockIn };
				// Merge positions map one-key-at-a-time to avoid losing arrays not present in the patch
				const curPositions =
					curClock.positions && typeof curClock.positions === 'object'
						? { ...curClock.positions }
						: {};
				const patchPositions =
					patchClock.positions && typeof patchClock.positions === 'object'
						? { ...patchClock.positions }
						: null;
				if (patchPositions) {
					const mergedPositions = { ...curPositions };
					for (const k of Object.keys(patchPositions)) mergedPositions[k] = patchPositions[k];
					patchClock.positions = mergedPositions;
				} else if (curPositions && Object.keys(curPositions).length) {
					// If patch did not include positions, keep existing
					patchClock.positions = curPositions;
				}
				// Merge remaining top-level __clockIn keys shallowly
				runtimePatch.__clockIn = { ...curClock, ...patchClock };
			}
			// Merge __notifMsgs conservatively so callers adding ids don't clobber other mappings
			if (runtimePatch.__notifMsgs && typeof runtimePatch.__notifMsgs === 'object') {
				const curNot =
					curRt.__notifMsgs && typeof curRt.__notifMsgs === 'object'
						? { ...curRt.__notifMsgs }
						: {};
				const patchNot = { ...runtimePatch.__notifMsgs };
				// shallow merge per notification id
				const mergedNot = { ...curNot };
				for (const nid of Object.keys(patchNot))
					mergedNot[nid] = { ...mergedNot[nid], ...patchNot[nid] };
				runtimePatch.__notifMsgs = mergedNot;
			}
		} catch (e) {
			// If merge fails for any reason, fall back to writing the provided runtimePatch
		}
		setRuntime(id, runtimePatch);
	}
	return { id, ...merged, ...runtimePatch }; // runtime merged view
}
function removeEvent(id) {
	id = String(id);
	const obj = loadObj();
	const i = obj.events.findIndex((e) => String(e.id) === id);
	if (i === -1) return false;
	obj.events.splice(i, 1);
	saveObj(obj);
	return true;
}

module.exports = { getEvents, getEvent, addEvent, updateEvent, removeEvent };
