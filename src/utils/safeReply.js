// Unified safe reply / single-send guard.
// Ensures at most one outbound response for a context (message or interaction) within a TTL.
const recent = new Map(); // key -> ts
const TTL_MS = 4000;

function makeKey(target) {
  try {
    if (!target) return 'null';
    if (target.id && target.author) return 'msg:' + target.id; // message object
    if (target.id && target.user) return 'ix:' + target.id; // interaction
    return 'obj:' + (target.id || Math.random().toString(36).slice(2));
  } catch { return 'err'; }
}

async function safeReply(target, payload, opts = {}) {
  const key = (opts.ctxId ? 'ctx:' + opts.ctxId : makeKey(target));
  const now = Date.now();
  const prev = recent.get(key) || 0;
  if (now - prev < TTL_MS) return { skipped: true };
  recent.set(key, now);
  // prune occasionally
  if (recent.size > 500) {
    for (const [k,v] of recent) { if (now - v > TTL_MS) recent.delete(k); }
  }
  try {
    if (target.reply) {
      return await target.reply(payload);
    }
    if (target.followUp && target.deferred && !target.replied) {
      return await target.followUp(payload);
    }
    if (target.editReply && target.deferred && !target.replied) {
      return await target.editReply(payload);
    }
    if (target.channel && target.channel.send) {
      return await target.channel.send(payload);
    }
  } catch (e) {
    try { require('./logger').warn('[safeReply] send failed', { err: e.message }); } catch {}
  }
  return null;
}

module.exports = { safeReply };
