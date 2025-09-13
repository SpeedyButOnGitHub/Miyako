// Minimal smoke test: load modules from src and exit to avoid lingering timers/intervals
try {
  [
    '../src/commands/profile.js',
    '../src/commands/leaderboard.js',
    '../src/commands/help.js',
    '../src/commands/schedule.js',
    '../src/commands/test.js',
    '../src/commands/scripts.js',
    '../src/events/messages.js',
    '../src/events/interactionEvents.js',
    '../src/utils/activeMenus.js',
    '../src/utils/leveling.js',
    '../src/utils/cashDrops.js'
  ].forEach(m => require(m));
  console.log('[smoke] modules loaded');
} catch (e) {
  console.error('[smoke] load error:', e);
  process.exitCode = 1;
}
// Force exit after a short delay in case modules set intervals
setTimeout(() => process.exit(), 50);
