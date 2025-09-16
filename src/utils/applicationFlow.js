// In-memory application submission flow sessions
// Handles sequential question prompts via modals and final confirmation.

const { getApplication } = require('./applications');

// sessionKey = `${userId}:${appId}`
const _sessions = new Map();

function startSession(userId, appId) {
	const app = getApplication(appId);
	if (!app) return null;
	const key = `${userId}:${appId}`;
	if (_sessions.has(key)) return _sessions.get(key);
	const sess = {
		userId: String(userId),
		appId: String(appId),
		index: 0,
		answers: [], // { qid, answer }
		createdAt: Date.now(),
		lastActivity: Date.now(),
		confirmed: false,
	};
	_sessions.set(key, sess);
	return sess;
}

function getSession(userId, appId) {
	return _sessions.get(`${userId}:${appId}`) || null;
}

function abandonSession(userId, appId) {
	_sessions.delete(`${userId}:${appId}`);
}

function recordAnswer(userId, appId, qid, answer) {
	const sess = getSession(userId, appId);
	if (!sess) return null;
	const existing = sess.answers.find((a) => a.qid === qid);
	if (existing) existing.answer = answer;
	else sess.answers.push({ qid, answer });
	sess.index += 1;
	sess.lastActivity = Date.now();
	return sess;
}

function sessionProgress(userId, appId) {
	const sess = getSession(userId, appId);
	if (!sess) return null;
	const app = getApplication(appId);
	if (!app) return null;
	const total = app.questions.length;
	return { current: sess.index, total };
}

// Cleanup stale sessions after 15 minutes inactivity
setInterval(
	() => {
		const now = Date.now();
		for (const [k, s] of _sessions.entries()) {
			if (now - s.lastActivity > 15 * 60 * 1000) _sessions.delete(k);
		}
	},
	5 * 60 * 1000,
).unref?.();

module.exports = {
	startSession,
	getSession,
	abandonSession,
	recordAnswer,
	sessionProgress,
};
