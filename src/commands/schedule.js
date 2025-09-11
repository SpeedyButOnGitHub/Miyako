// Compatibility shim: re-export the modular API from the folder's index.
// Important: explicitly target index to avoid self-resolving './schedule.js'.
module.exports = require('./schedule/index.js');
