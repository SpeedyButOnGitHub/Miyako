// In-memory command logger with optional channel reporting and expected vs actual diffing
const { config } = require('./storage');
const { CONFIG_LOG_CHANNEL } = require('./logChannels');

const state = {
  logs: [],
  lastSendTs: 0,
};

function getLimit() {
  const cfg = config.commandLogging || {};
  const max = Number(cfg.maxEntries); return Number.isFinite(max) && max > 0 ? Math.min(max, 5000) : 500;
}

function enabled() {
  const cfg = config.commandLogging || {}; return !!cfg.enabled;
}

function add(log) {
  if (!enabled()) return;
  const limit = getLimit();
  state.logs.push(log);
  if (state.logs.length > limit) state.logs.splice(0, state.logs.length - limit);
}

function start(ctx) {
  if (!enabled()) return null;
  const now = Date.now();
  return {
    id: `${ctx.name}:${ctx.userId}:${now}`,
    t0: now,
    ...ctx,
  };
}

function finish(client, startCtx, result) {
  if (!enabled() || !startCtx) return;
  const dt = Date.now() - (startCtx.t0 || Date.now());
  const entry = {
    ts: Date.now(),
    dt,
    ...startCtx,
    ...result,
  };
  add(entry);
  maybeReport(client, entry);
}

function normalizeMsgShape(msg) {
  if (!msg) return null;
  const embeds = Array.isArray(msg.embeds) ? msg.embeds : (msg.embeds ? [msg.embeds] : []);
  return {
    id: msg.id,
    type: 'message',
    content: (msg.content || '').slice(0, 1800),
    embedsCount: embeds.length,
    componentsCount: Array.isArray(msg.components) ? msg.components.length : 0,
  };
}

function diffExpected(actual, expected) {
  if (!expected || !actual) return null;
  try {
    const diffs = [];
    if (typeof expected.content === 'string') {
      const a = (actual.content || '').trim(); const e = expected.content.trim();
      if (e && a !== e) diffs.push(`content mismatch`);
    }
    if (typeof expected.embedsCount === 'number') {
      if ((actual.embedsCount || 0) !== expected.embedsCount) diffs.push(`embedsCount ${actual.embedsCount} != ${expected.embedsCount}`);
    }
    if (typeof expected.componentsCount === 'number') {
      if ((actual.componentsCount || 0) !== expected.componentsCount) diffs.push(`componentsCount ${actual.componentsCount} != ${expected.componentsCount}`);
    }
    return diffs.length ? diffs : null;
  } catch { return null; }
}

async function maybeReport(client, entry) {
  try {
    const cfg = config.commandLogging || {};
    if (!cfg.sendToChannel && !cfg.testingCompare) return;
    // Only send if diff in testing mode, or explicit sendToChannel enabled
    const want = (config.testingMode && cfg.testingCompare && entry.diff) || cfg.sendToChannel;
    if (!want) return;
    const now = Date.now();
    const minGap = Number(cfg.sendIntervalMs) || 5000;
    if (now - state.lastSendTs < minGap) return; // rate-limit
    state.lastSendTs = now;
    const channelId = cfg.logChannelId || CONFIG_LOG_CHANNEL;
    if (!channelId) return;
    const ch = await client.channels.fetch(channelId).catch(()=>null);
    if (!ch || !ch.send) return;
    const parts = [];
    parts.push(`🧪 Cmd: ${entry.name} • by <@${entry.userId}> in <#${entry.channelId}> • ${entry.dt}ms`);
    if (entry.diff && entry.diff.length) parts.push(`Diff: ${entry.diff.join('; ')}`);
    if (entry.params && Object.keys(entry.params).length) parts.push(`Args: ${JSON.stringify(entry.params).slice(0, 300)}`);
    await ch.send({ content: parts.join('\n') }).catch(()=>{});
  } catch {}
}

function getLogs() { return state.logs.slice(-getLimit()); }
function clearLogs() { state.logs = []; }

module.exports = { start, finish, getLogs, clearLogs, normalizeMsgShape, diffExpected };
