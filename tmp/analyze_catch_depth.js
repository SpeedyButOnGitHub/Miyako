const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
let depth=0;
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  // compute depth BEFORE processing this line's braces
  const depthBefore = depth;
  if(line.trim().startsWith('} catch') || line.trim().startsWith('}catch')){
    console.log(`Line ${i+1} depthBefore=${depthBefore} => ${line.trim()}`);
  }
  // update depth after
  for(const ch of line){ if(ch==='{' ) depth++; if(ch==='}') depth--; }
}
console.log('final depth', depth);
