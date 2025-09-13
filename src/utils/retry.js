// Small retry helper for async operations with backoff and logging
const { config } = require('./storage');
const logger = require('./logger');

async function retry(fn, opts = {}) {
  const attempts = Number.isFinite(opts.attempts) ? Math.max(1, opts.attempts) : (opts.attemptsDefault || 3);
  const baseMs = Number.isFinite(opts.baseMs) ? opts.baseMs : 50;
  const maxMs = Number.isFinite(opts.maxMs) ? opts.maxMs : 500;
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = Math.min(maxMs, baseMs * Math.pow(2, i));
      try { logger.warn('[retry] attempt failed', { attempt: i+1, err: err?.message }); } catch {}
      if (i < attempts - 1) await new Promise(r => setTimeout(r, wait));
    }
  }
  // After attempts exhausted, throw last error
  try { logger.error('[retry] all attempts failed', { attempts, err: lastErr?.message }); } catch {}
  throw lastErr;
}

module.exports = { retry };
