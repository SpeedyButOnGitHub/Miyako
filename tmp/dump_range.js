const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
for(let i=1130;i<=1245;i++){
  const line = lines[i-1] || '';
  console.log((i).toString().padStart(4)+':', line);
}
