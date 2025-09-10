// Re-export utils from project root for transitional compatibility
module.exports = new Proxy({}, {
  get(_, prop) {
    // allow require('./utils/<name>') from src to map to root utils
    try { return require(`../../utils/${prop}`); } catch {}
    try { return require(`../../utils/${prop}.js`); } catch {}
    // fallback to index
    try { return require(`../../utils/index.js`)[prop]; } catch {}
    throw new Error(`utils module not found: ${String(prop)}`);
  }
});
