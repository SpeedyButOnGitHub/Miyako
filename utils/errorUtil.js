// Centralized error handling helpers
function logError(scope, err) {
  const msg = err && err.stack ? err.stack : String(err);
  console.error(`[${scope}]`, msg);
}

function safeReply(target, content, opts = {}) {
  if (!target) return;
  try {
    if (typeof target.reply === 'function') {
      return target.reply({ content, ...opts }).catch(()=>{});
    }
  } catch {}
}

module.exports = { logError, safeReply };
