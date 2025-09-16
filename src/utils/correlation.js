// Simple lightweight correlation id generator (no external deps)
function newCorrelationId() {
	// timestamp + random hex
	const ts = Date.now().toString(36);
	const rnd = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
	return `${ts}-${rnd}`;
}

module.exports = { newCorrelationId };
