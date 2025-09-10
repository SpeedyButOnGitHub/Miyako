// Generate a compact, paste-friendly project summary with folder tree and important snippets
// Output: PROJECT_SUMMARY.txt at repo root

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outFile = path.join(root, 'PROJECT_SUMMARY.txt');

const excludeDirs = new Set(['node_modules', '.git', '.vscode']);
const excludeFiles = new Set(['.env', '.bot.pid', '.miyako.lock', 'logs_runner.txt', 'FULL_CONTEXT.txt', 'PROJECT_SUMMARY.txt']);
const allowedExt = new Set(['.js', '.json', '.md']);

function listAll(relDir = '.') {
  const abs = path.join(root, relDir);
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const result = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (excludeDirs.has(e.name)) continue;
      result.push({ type: 'dir', rel: path.join(relDir, e.name) });
      result.push(...listAll(path.join(relDir, e.name)));
    } else if (e.isFile()) {
      if (excludeFiles.has(e.name)) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!allowedExt.has(ext)) continue;
      result.push({ type: 'file', rel: path.join(relDir, e.name) });
    }
  }
  return result;
}

function makeTree(lines) {
  // Build nested tree text using indentation and sorted paths
  const sorted = [...lines].sort((a, b) => a.rel.localeCompare(b.rel));
  const out = [];
  out.push('// Project Structure');
  const prefix = '';
  out.push(prefix + path.basename(root) + '/');
  for (const { rel, type } of sorted) {
    const parts = rel.split(path.sep);
    let indent = '  ';
    for (let i = 0; i < parts.length - 1; i++) indent += '  ';
    out.push(`${'  '.repeat(parts.length)}${type === 'dir' ? parts[parts.length - 1] + '/' : parts[parts.length - 1]}`);
  }
  return out.join('\n');
}

function extractObjectKeysFromBlock(src, startIdx) {
  // Naive brace scanner to get shallow keys from an object literal starting at or after startIdx
  let i = startIdx;
  const n = src.length;
  let depth = 0;
  let started = false;
  const keys = new Set();
  while (i < n) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; i++; continue; }
    if (ch === '}') { depth--; i++; if (started && depth === 0) break; continue; }
    if (started && depth === 1) {
      // capture key before colon (simple case)
      const m = src.slice(i).match(/\s*([A-Za-z0-9_\-"']+)\s*:/);
      if (m) {
        let key = m[1];
        key = key.replace(/^['"]|['"]$/g, '');
        if (key) keys.add(key);
        i += m.index + m[0].length;
        continue;
      }
    }
    i++;
  }
  return Array.from(keys);
}

function summarizeJS(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split(/\r?\n/);
  const out = [];
  const push = (s) => out.push(s);
  push('// ...');
  // Scan line-by-line for key constructs
  lines.forEach((line, idx) => {
    const l = line.trim();
    if (/^class\s+\w+/.test(l)) push(l);
    else if (/^async\s+function\s+\w+\(/.test(l)) push(l.replace(/\s+\{\s*$/, '')); 
    else if (/^function\s+\w+\(/.test(l)) push(l.replace(/\s+\{\s*$/, ''));
    else if (/^const\s+\w+\s*=\s*async\s*\(/.test(l)) push(l.replace(/\{\s*$/, '')); 
    else if (/^const\s+\w+\s*=\s*\(/.test(l) && l.includes('=>')) push(l.replace(/\{\s*$/, ''));
    else if (/\.on\(\s*['"][^'"]+['"]/.test(l)) push(l);
    else if (/ActiveMenus\.registerHandler\(/.test(l)) push(l);
    else if (/module\.exports\s*=\s*\{/.test(l)) {
      // collect export keys
      const start = lines.slice(0, idx + 1).join('\n').length;
      const keys = extractObjectKeysFromBlock(src, start);
      push('module.exports = { ' + keys.join(', ') + ' }');
    } else if (/module\.exports\./.test(l) || /^exports\./.test(l)) {
      push(l);
    } else if (/^const\s+defaultConfig\s*=\s*\{/.test(l)) {
      const start = lines.slice(0, idx + 1).join('\n').length;
      const keys = extractObjectKeysFromBlock(src, start);
      push('const defaultConfig = { ' + keys.join(', ') + ' }');
    }
  });
  push('// ...');
  return out.join('\n');
}

function summarizeJSON(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(txt);
    if (Array.isArray(json)) {
      return `// JSON Array (length=${json.length})`;
    }
    const keys = Object.keys(json || {});
    return '/* JSON keys: ' + keys.join(', ') + ' */';
  } catch {
    // Fallback to first ~20 lines
    const first = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(0, 20).join('\n');
    return first + '\n// ...';
  }
}

function summarizeMD(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const heads = lines.filter(l => /^#\s/.test(l)).slice(0, 10);
  return (heads.join('\n') || '// markdown');
}

function main() {
  const items = listAll();
  const treeText = makeTree(items);
  const parts = [];
  parts.push('===== COMPACT PROJECT SUMMARY =====');
  parts.push(`Project: ${path.basename(root)}  (generated: ${new Date().toISOString()})`);
  parts.push('');
  parts.push(treeText);
  parts.push('');
  parts.push('// Important Snippets (condensed)');

  for (const it of items) {
    if (it.type !== 'file') continue;
    const rel = it.rel.replace(/\\/g, '/');
    const ext = path.extname(rel).toLowerCase();
    parts.push('');
    parts.push(`// FILE: ${rel}`);
    try {
      if (ext === '.js') parts.push(summarizeJS(path.join(root, rel)));
      else if (ext === '.json') parts.push(summarizeJSON(path.join(root, rel)));
      else if (ext === '.md') parts.push(summarizeMD(path.join(root, rel)));
    } catch (e) {
      parts.push(`// (failed to summarize: ${e.message})`);
    }
  }

  parts.push('');
  parts.push('===== END SUMMARY =====');

  fs.writeFileSync(outFile, parts.join('\n'), 'utf8');
  console.log(`[export-summary] Wrote ${outFile}`);
}

if (require.main === module) main();
