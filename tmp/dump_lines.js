const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
for(let i=1225;i<=1235;i++){
  const line = lines[i-1] || '';
  console.log((i).toString().padStart(4)+':', line);
  console.log('chars:', line.split('').map(c=>c.charCodeAt(0)).join(' '));
}
