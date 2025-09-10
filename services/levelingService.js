// Leveling service: wraps text + VC xp/level logic for future caching, analytics & aggregation
// Exposes uniform helpers so commands do not pull from raw utils.* modules directly.
module.exports = require('../src/services/levelingService');
