const fs = require('fs');
const path = require('path');
const { dataDir } = require('./paths');
const { logError } = require('./errorUtil');

// Data files (gitignored)
const APPS_FILE = path.join(dataDir(), 'applications.json');
const PANELS_FILE = path.join(dataDir(), 'applicationPanels.json');

function ensureFiles() {
	try {
		const dir = dataDir();
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		if (!fs.existsSync(APPS_FILE))
			fs.writeFileSync(
				APPS_FILE,
				JSON.stringify({ nextAppId: 1, applications: [], submissions: [] }, null, 2),
			);
		if (!fs.existsSync(PANELS_FILE))
			fs.writeFileSync(PANELS_FILE, JSON.stringify({ nextPanelId: 1, panels: [] }, null, 2));
	} catch (e) {
		logError('applications.ensure', e);
	}
}

function loadApps() {
	ensureFiles();
	try {
		return JSON.parse(fs.readFileSync(APPS_FILE, 'utf8'));
	} catch {
		return { nextAppId: 1, applications: [], submissions: [] };
	}
}
function saveApps(obj) {
	try {
		fs.writeFileSync(APPS_FILE, JSON.stringify(obj, null, 2));
	} catch (e) {
		logError('applications.save', e);
	}
}
function loadPanels() {
	ensureFiles();
	try {
		return JSON.parse(fs.readFileSync(PANELS_FILE, 'utf8'));
	} catch {
		return { nextPanelId: 1, panels: [] };
	}
}
function savePanels(obj) {
	try {
		fs.writeFileSync(PANELS_FILE, JSON.stringify(obj, null, 2));
	} catch (e) {
		logError('applications.savePanels', e);
	}
}

// --- Applications CRUD ---
function listApplications() {
	return loadApps().applications;
}
function getApplication(id) {
	id = String(id);
	return listApplications().find((a) => String(a.id) === id) || null;
}
function addApplication(app) {
	const db = loadApps();
	const id = String(db.nextAppId++);
	const base = {
		id,
		name: 'New Application',
		enabled: true,
		submissionChannelId: null,
		dmResponses: true,
		acceptMessage: 'Your application has been accepted!',
		denyMessage: 'Your application has been denied.',
		confirmMessage: 'Are you sure you want to submit?',
		completionMessage: 'Your application has been submitted.',
		restrictedRoles: [],
		requiredRoles: [],
		deniedRoles: [],
		managerRoles: [],
		acceptedRoles: [],
		pendingRole: null,
		questions: [], // { id, type:'short'|'long', label, required }
		...app,
	};
	db.applications.push(base);
	saveApps(db);
	return base;
}
function updateApplication(id, patch) {
	const db = loadApps();
	const i = db.applications.findIndex((a) => String(a.id) === String(id));
	if (i === -1) return null;
	db.applications[i] = { ...db.applications[i], ...patch };
	saveApps(db);
	return db.applications[i];
}
function removeApplication(id) {
	const db = loadApps();
	const i = db.applications.findIndex((a) => String(a.id) === String(id));
	if (i === -1) return false;
	db.applications.splice(i, 1);
	saveApps(db);
	return true;
}

// --- Panels CRUD ---
function listPanels() {
	return loadPanels().panels;
}
function getPanel(id) {
	id = String(id);
	return listPanels().find((p) => String(p.id) === id) || null;
}
function addPanel(panel) {
	const db = loadPanels();
	const id = String(db.nextPanelId++);
	const base = {
		id,
		name: 'Applications',
		description: 'Select an application below.',
		channelId: null,
		messageJSON: null,
		messageId: null,
		applicationIds: [],
		...panel,
	};
	db.panels.push(base);
	savePanels(db);
	return base;
}
function updatePanel(id, patch) {
	const db = loadPanels();
	const i = db.panels.findIndex((p) => String(p.id) === String(id));
	if (i === -1) return null;
	db.panels[i] = { ...db.panels[i], ...patch };
	savePanels(db);
	return db.panels[i];
}
function removePanel(id) {
	const db = loadPanels();
	const i = db.panels.findIndex((p) => String(p.id) === String(id));
	if (i === -1) return false;
	db.panels.splice(i, 1);
	savePanels(db);
	return true;
}

// --- Submissions ---
function addSubmission(appId, userId, answers) {
	const db = loadApps();
	const id = String((db.submissions?.length || 0) + 1);
	const sub = {
		id,
		appId: String(appId),
		userId: String(userId),
		answers,
		status: 'pending',
		createdAt: Date.now(),
		decidedAt: null,
		decidedBy: null,
	};
	if (!Array.isArray(db.submissions)) db.submissions = [];
	db.submissions.push(sub);
	saveApps(db);
	return sub;
}
function listSubmissions(filter = {}) {
	const db = loadApps();
	return (db.submissions || []).filter((s) => {
		for (const [k, v] of Object.entries(filter)) if (s[k] !== v) return false;
		return true;
	});
}
function updateSubmission(id, patch) {
	const db = loadApps();
	if (!Array.isArray(db.submissions)) db.submissions = [];
	const i = db.submissions.findIndex((s) => String(s.id) === String(id));
	if (i === -1) return null;
	db.submissions[i] = { ...db.submissions[i], ...patch };
	saveApps(db);
	return db.submissions[i];
}

// --- Analytics (lightweight, computed on demand) ---
function summarizeApplications() {
	const db = loadApps();
	const apps = db.applications || [];
	const subs = db.submissions || [];
	const byApp = {};
	for (const a of apps) {
		byApp[a.id] = {
			appId: a.id,
			name: a.name,
			total: 0,
			pending: 0,
			accepted: 0,
			denied: 0,
			acceptanceRate: 0,
		};
	}
	for (const s of subs) {
		if (!byApp[s.appId])
			byApp[s.appId] = {
				appId: s.appId,
				name: `App ${s.appId}`,
				total: 0,
				pending: 0,
				accepted: 0,
				denied: 0,
				acceptanceRate: 0,
			};
		const bucket = byApp[s.appId];
		bucket.total++;
		if (s.status === 'pending') bucket.pending++;
		else if (s.status === 'accepted') bucket.accepted++;
		else if (s.status === 'denied') bucket.denied++;
	}
	for (const k of Object.keys(byApp)) {
		const b = byApp[k];
		const decided = b.accepted + b.denied;
		b.acceptanceRate = decided ? +((b.accepted / decided) * 100).toFixed(1) : 0;
	}
	// overall summary
	const overall = Object.values(byApp).reduce(
		(acc, b) => {
			acc.total += b.total;
			acc.pending += b.pending;
			acc.accepted += b.accepted;
			acc.denied += b.denied;
			return acc;
		},
		{ total: 0, pending: 0, accepted: 0, denied: 0 },
	);
	overall.acceptanceRate =
		overall.accepted + overall.denied
			? +((overall.accepted / (overall.accepted + overall.denied)) * 100).toFixed(1)
			: 0;
	return { overall, applications: Object.values(byApp).sort((a, b) => b.total - a.total) };
}

// --- Role / permission checks ---
function userHasAny(member, roleIds = []) {
	return roleIds.some((r) => member.roles.cache.has(r));
}
function canApply(member, app) {
	if (!app.enabled) return { ok: false, reason: 'This application is currently disabled.' };
	if (userHasAny(member, app.restrictedRoles))
		return { ok: false, reason: 'You are restricted from applying.' };
	if (userHasAny(member, app.deniedRoles)) return { ok: false, reason: 'You cannot apply.' };
	if (app.requiredRoles.length && !userHasAny(member, app.requiredRoles))
		return { ok: false, reason: 'Missing required role(s).' };
	return { ok: true };
}
function isManager(member, app) {
	return userHasAny(member, app.managerRoles);
}

module.exports = {
	// apps
	listApplications,
	getApplication,
	addApplication,
	updateApplication,
	removeApplication,
	// panels
	listPanels,
	getPanel,
	addPanel,
	updatePanel,
	removePanel,
	// submissions
	addSubmission,
	listSubmissions,
	updateSubmission,
	// analytics
	summarizeApplications,
	// checks
	canApply,
	isManager,
};
