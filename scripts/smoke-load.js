// Minimal smoke test: load modules and exit to avoid lingering timers/intervals
try {
  [
    '../commands/profile.js',
    '../commands/leaderboard.js',
    '../commands/help.js',
    '../commands/schedule.js',
    '../commands/test.js',
    '../commands/scripts.js',
    '../events/messages.js',
    '../events/interactionEvents.js',
    '../utils/activeMenus.js',
    '../utils/leveling.js',
    '../utils/cashDrops.js'
  ].forEach(m => require(m));
  console.log('[smoke] modules loaded');
} catch (e) {
  console.error('[smoke] load error:', e);
  process.exitCode = 1;
}
// Force exit after a short delay in case modules set intervals
setTimeout(() => process.exit(), 50);
