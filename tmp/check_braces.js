const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
let depth=0;
let maxDepth=0;
let firstUnclosedLine=null;
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  const before = depth;
  for(const ch of line){ if(ch==='{') depth++; if(ch==='}') depth--; }
  if(depth>maxDepth) { maxDepth = depth; }
  if(depth<0) {
    console.log('Negative depth at', i+1);
    depth=0;
  }
  if(before!==depth) console.log(`${(i+1).toString().padStart(4)} depth=${depth} (change ${depth-before}) ${line.trim()}`);
}
console.log('final depth', depth, 'maxDepth', maxDepth);
if(depth>0) console.log('Missing', depth, 'closing brace(s)');
