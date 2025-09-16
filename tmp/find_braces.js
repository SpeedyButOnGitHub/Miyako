const fs = require('fs');
const path = 'Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split('\n');
let depth = 0;
let tryLine = null;
for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	if (line.includes('client.on("interactionCreate"')) {
		// find next 'try {' after this
		for (let j = i; j < lines.length; j++) {
			if (lines[j].includes('try {')) {
				tryLine = j + 1;
				break;
			}
		}
		break;
	}
}
console.log('tryLine (1-based):', tryLine);
for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	for (const ch of line) {
		if (ch === '{') depth++;
		if (ch === '}') depth--;
	}
	if (i >= (tryLine ? tryLine - 5 : 0) && i <= (tryLine ? tryLine + 500 : lines.length)) {
		console.log((i + 1).toString().padStart(4) + ' depth=' + depth + ' ' + line.trim());
	}
	// stop after printing a chunk
}
console.log('final depth', depth);
