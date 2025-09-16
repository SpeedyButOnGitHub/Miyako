// Lightweight in-memory metrics tracker
const metrics = {
	commands: 0,
	interactions: 0,
	errors: 0,
	lastCommandAt: 0,
};
function markCommand() {
	metrics.commands++;
	metrics.lastCommandAt = Date.now();
}
function markInteraction() {
	metrics.interactions++;
}
function markError() {
	metrics.errors++;
}
function getMetrics() {
	return { ...metrics };
}
module.exports = { markCommand, markInteraction, markError, getMetrics };
