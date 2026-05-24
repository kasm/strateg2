// Shared utilities for analysis scripts. Not a standalone runnable.
// Filename leads with underscore to signal "internal — don't invoke directly".

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, basename, extname } from 'node:path';
import * as acorn from 'acorn';

export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out',
  'coverage', '.nyc_output', '.cache', '.parcel-cache',
  '.vite', '.vitest-cache', '.next', '.eslintcache',
  '.idea', '.vscode', '.claude',
]);

export const JS_EXTS = ['.js', '.mjs', '.cjs'];
export const TEXT_EXTS = ['.js', '.mjs', '.cjs', '.html', '.htm', '.css', '.json', '.md', '.txt', '.glsl', '.vert', '.frag'];

export function getProjectRoot(startDir = process.cwd()) {
  let cur = resolve(startDir);
  while (true) {
    if (existsSync(join(cur, 'package.json'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return resolve(startDir);
    cur = parent;
  }
}

export function loadPackageJson(root = getProjectRoot()) {
  const p = join(root, 'package.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch { return null; }
}

export function* walkFiles(root, opts = {}) {
  const { extensions = null, includeHidden = false } = opts;
  if (!existsSync(root)) return;
  let rootStat;
  try { rootStat = statSync(root); } catch { return; }
  if (rootStat.isFile()) { yield root; return; }
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const name = e.name;
      if (IGNORED_DIRS.has(name)) continue;
      if (!includeHidden && name.startsWith('.')) continue;
      const full = join(dir, name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        if (extensions) {
          const lower = name.toLowerCase();
          if (!extensions.some(ext => lower.endsWith(ext))) continue;
        }
        yield full;
      }
    }
  }
}

export function rel(abs, root = getProjectRoot()) {
  return relative(root, abs).split(sep).join('/');
}

export function parseJS(source, filename) {
  const base = {
    ecmaVersion: 'latest',
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    allowHashBang: true,
    locations: true,
  };
  try {
    return acorn.parse(source, { ...base, sourceType: 'module' });
  } catch {
    try {
      return acorn.parse(source, { ...base, sourceType: 'script' });
    } catch (e) {
      return { _parseError: e.message, type: 'Program', body: [], loc: null };
    }
  }
}

// Tiny AST walker — visits every node, calls visit(node, parent).
export function walkAst(node, visit, parent = null) {
  if (!node || typeof node !== 'object' || !node.type) return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'range' || key === 'start' || key === 'end' || key === 'parent') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) walkAst(child, visit, node);
    } else if (val && typeof val === 'object' && val.type) {
      walkAst(val, visit, node);
    }
  }
}

export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args.flags[key] = next; i++; }
      else args.flags[key] = true;
    } else args._.push(a);
  }
  return args;
}

export function writeOut(content, outPath) {
  const text = content.endsWith('\n') ? content : content + '\n';
  if (!outPath) { process.stdout.write(text); return; }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, text, 'utf8');
  process.stderr.write(`[wrote] ${outPath}\n`);
}

export function mdTable(headers, rows) {
  if (!rows.length) return '_(empty)_';
  const head = '| ' + headers.join(' | ') + ' |';
  const sep = '|' + headers.map(() => '---').join('|') + '|';
  const body = rows.map(r => '| ' + r.map(cellEscape).join(' | ') + ' |').join('\n');
  return [head, sep, body].join('\n');
}

function cellEscape(v) {
  const s = v == null ? '' : String(v);
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

export function safeReadFile(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

export function fileStats(path) {
  try { return statSync(path); } catch { return null; }
}

export function getTargetPath(args, root) {
  if (args._[0]) return resolve(root, args._[0]);
  return root;
}

export function getOutPath(args) {
  return typeof args.flags.out === 'string' ? args.flags.out : null;
}

export function header(title, target, root) {
  const scope = target === root ? '(project root)' : rel(target, root);
  return `# ${title}\n\n_Scope: ${scope}_\n_Generated: ${new Date().toISOString()}_\n`;
}

// Resolve a JS import specifier to an absolute file path, or null if external/unresolvable.
export function resolveImport(spec, fromFile) {
  if (!spec || typeof spec !== 'string') return null;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null; // bare specifier = npm dep
  const fromDir = dirname(fromFile);
  const candidates = [];
  const baseAbs = resolve(fromDir, spec);
  // Direct
  candidates.push(baseAbs);
  // With extensions
  for (const ext of JS_EXTS) candidates.push(baseAbs + ext);
  // index files
  for (const ext of JS_EXTS) candidates.push(join(baseAbs, 'index' + ext));
  for (const c of candidates) {
    if (existsSync(c)) {
      const s = fileStats(c);
      if (s && s.isFile()) return c;
    }
  }
  return null;
}

export { basename, extname, dirname, join, resolve, relative };
