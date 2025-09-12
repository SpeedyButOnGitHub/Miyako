// Robust early crash reporter to guarantee logging of fatal conditions.
// Attach this BEFORE other heavy requires so uncaught exceptions during module load are captured.
const fs = require('fs');
const { logError } = require('./errorUtil');
const { runtimeFile } = require('./paths');

const CRASH_LATEST_FILE = runtimeFile('crash-latest.json');
let attached = false;
let clientRef = null;
let fatalHandled = false;
let heartbeatTimer = null;

function safeWrite(file, data) {
	try { fs.writeFileSync(file, data); } catch { /* ignore */ }
}

function appendEmergency(entry) {
	// Fallback append-only line file if main JSON write somehow fails
		const emergencyFile = runtimeFile('error-emergency.log');
	try { fs.appendFileSync(emergencyFile, JSON.stringify(entry) + '\n'); } catch { /* ignore */ }
}

async function gracefulShutdown(reason, err, graceful = false) {
	if (fatalHandled) return; // ensure single execution
	fatalHandled = true;
	let mem = null; let cpu = null; try { const u = process.memoryUsage(); mem = { rss:u.rss, heapTotal:u.heapTotal, heapUsed:u.heapUsed }; } catch {}
	try { const usage = process.cpuUsage(); cpu = usage; } catch {}
	const entry = {
		ts: Date.now(),
		scope: graceful ? 'shutdown' : 'fatal',
		reason,
		message: err && (err.stack || err.message || String(err)),
		memory: mem,
		cpu
	};
	// Write dedicated crash snapshot (overwrites)
	safeWrite(CRASH_LATEST_FILE, JSON.stringify(entry, null, 2));
	// Also ensure it is in the rolling log
	try { logError(graceful ? 'exit' : 'fatal', err || reason); } catch { appendEmergency(entry); }

	// Attempt polite shutdown tasks only if we have a client and it's ready
	try {
		// Flush deferred backups first so data snapshots are captured once per shutdown
		try { require('./writeQueue').flushDeferredBackups(); } catch {}
		if (clientRef && clientRef.isReady && clientRef.isReady()) {
			const { setStatusChannelName, sendBotShutdownMessage } = require('./botStatus');
			await setStatusChannelName(clientRef, false);
			await sendBotShutdownMessage(clientRef);
		}
	} catch (e) {
		try { logError('fatal:shutdown', e); } catch { appendEmergency({ ts: Date.now(), scope: 'fatal:shutdown', message: String(e) }); }
	}
	// Force exit (skip during Jest tests to avoid interfering with test runner)
	if (!process.env.JEST_WORKER_ID) process.exit(graceful ? 0 : 1);
}

function onUncaught(err) { gracefulShutdown('uncaughtException', err); }
function onUnhandled(reason) { gracefulShutdown('unhandledRejection', reason); }
function onSignal(sig) {
	const graceful = (sig === 'SIGINT' || sig === 'SIGTERM');
	// Never classify SIGINT/SIGTERM as fatal; treat as controlled shutdown
	gracefulShutdown(`signal:${sig}`, null, graceful);
}

function initEarly() {
	if (attached) return;
	attached = true;

	// Placeholder crash snapshot so absence itself is meaningful later
	if (!fs.existsSync(CRASH_LATEST_FILE)) {
		safeWrite(CRASH_LATEST_FILE, JSON.stringify({ ts: Date.now(), status: 'init', note: 'process started' }, null, 2));
	}

	process.on('uncaughtException', onUncaught);
	process.on('unhandledRejection', onUnhandled);
	for (const sig of ['SIGINT','SIGTERM','SIGQUIT']) {
		try { process.on(sig, () => onSignal(sig)); } catch { /* ignore */ }
	}
	process.on('warning', (w) => { try { logError('warning', w); } catch {} });
	process.on('exit', (code) => {
		if (!fatalHandled) {
			if (code !== 0) {
				// treat abnormal exit as fatal without stack
				try { logError('fatal:exit', `abnormal exit code ${code}`); } catch {}
				safeWrite(CRASH_LATEST_FILE, JSON.stringify({ ts: Date.now(), scope: 'fatal', reason: 'abnormal-exit', code }, null, 2));
			} else {
				try { logError('exit', `process exiting with code ${code}`); } catch {}
			}
		}
	});

	// Lightweight heartbeat every 60s so we can detect hung process vs crash by timestamp
	heartbeatTimer = setInterval(() => {
		try {
				const hbFile = runtimeFile('process-heartbeat.json');
			safeWrite(hbFile, JSON.stringify({ ts: Date.now() }, null, 2));
		} catch {}
	}, 60000);
	if (heartbeatTimer.unref) heartbeatTimer.unref();
}

function attachClient(client) {
	clientRef = client;
	// Crash replay summary
	try {
		const latest = fs.existsSync(CRASH_LATEST_FILE) ? JSON.parse(fs.readFileSync(CRASH_LATEST_FILE,'utf8')) : null;
		if (latest && latest.scope !== 'init' && client?.channels) {
			const { CONFIG_LOG_CHANNEL } = require('./logChannels');
			client.channels.fetch(CONFIG_LOG_CHANNEL).then(ch => {
				if (!ch) return;
				const when = latest.ts ? `<t:${Math.floor(latest.ts/1000)}:R>` : 'unknown';
				const summary = `🧯 Last Crash Replay: **${latest.reason || latest.scope}** ${when}`;
				ch.send({ content: summary.slice(0,1900) }).catch(()=>{});
			}).catch(()=>{});
		}
	} catch {}
}

module.exports = { initEarly, attachClient };
