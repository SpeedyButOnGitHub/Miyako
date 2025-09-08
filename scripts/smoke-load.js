// Minimal smoke test: load modules and exit to avoid lingering timers/intervals
try {
  require('../commands/profile.js');
  require('../events/messages.js');
  console.log('[smoke] modules loaded');
} catch (e) {
  console.error('[smoke] load error:', e);
  process.exitCode = 1;
}
// Force exit after a short delay in case modules set intervals
setTimeout(() => process.exit(), 50);
