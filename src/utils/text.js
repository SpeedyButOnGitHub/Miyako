// Text / string utilities centralizing shared helpers to avoid circular deps.
function toTitleCase(str) {
	if (!str) return str;
	return String(str)
		.replace(/[-_]+/g, ' ')
		.split(/\s+/)
		.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
		.join(' ')
		.trim();
}

module.exports = { toTitleCase };
