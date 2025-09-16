const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path, 'utf8');
const lines = s.split('\n');
let tries = [];
let catches = [];
for (let i = 0; i < lines.length; i++) {
	if (lines[i].includes('try {')) tries.push({ line: i + 1, text: lines[i].trim() });
	if (lines[i].trim().startsWith('} catch (')) catches.push({ line: i + 1, text: lines[i].trim() });
}
console.log('tries', tries.length, 'catches', catches.length);
console.log('last 5 tries:', tries.slice(-5));
console.log('last 5 catches:', catches.slice(-5));
if (catches.length) {
	const c = catches[catches.length - 1];
	console.log('\nContext around last catch at line', c.line);
	for (let i = c.line - 5; i <= c.line + 5; i++)
		console.log((i + 1).toString().padStart(4), lines[i] || '');
}
