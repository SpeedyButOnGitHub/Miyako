const fs = require('fs');
const path = 'C:/Users/tevme/Documents/Projects/Miyako/src/events/interactionEvents.js';
const s = fs.readFileSync(path,'utf8');
const lines = s.split('\n');
const stack = [];
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  for(let j=0;j<line.length;j++){
    const ch = line[j];
    if(ch==='{' ) stack.push({line:i+1, col:j+1, snippet: line.trim().slice(0,80)});
    if(ch==='}') {
      if(stack.length===0) {
        console.log('Unmatched closing brace at', i+1);
      } else {
        stack.pop();
      }
    }
  }
}
console.log('Remaining open braces:', stack.length);
if(stack.length>0) console.log(stack.map(x=>`line ${x.line} col ${x.col} -> ${x.snippet}`).join('\n'));
