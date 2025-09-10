const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
  let dir = startDir;
  const root = path.parse(dir).root;
  while (dir && dir !== root) {
    try {
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    } catch {}
    dir = path.dirname(dir);
  }
  // Fallback to CWD when package.json not found
  return process.cwd();
}

const projectRoot = findProjectRoot(__dirname);

function cfgPath(...parts) { return path.join(projectRoot, 'config', ...parts); }
function dataPath(...parts) { return path.join(projectRoot, ...parts); }

module.exports = { projectRoot, cfgPath, dataPath };
