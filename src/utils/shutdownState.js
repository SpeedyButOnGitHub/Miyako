const fs = require('fs');
const path = require('path');
const { runtimeFile } = require('./paths');

const FILE = path.resolve(runtimeFile('lastShutdown.json'));

function recordShutdown() {
	try {
		fs.writeFileSync(FILE, JSON.stringify({ ts: Date.now() }));
	} catch {}
}

function readLastShutdown() {
	try {
		if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8')).ts || null;
	} catch {}
	return null;
}

module.exports = { recordShutdown, readLastShutdown };
