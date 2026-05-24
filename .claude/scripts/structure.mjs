#!/usr/bin/env node
// structure.mjs — directory tree, file counts by extension, detected entry points, LOC.

import {
  getProjectRoot, loadPackageJson, walkFiles, rel, parseArgs, writeOut,
  mdTable, fmtSize, safeReadFile, fileStats, getTargetPath, getOutPath, header,
  IGNORED_DIRS, extname, basename, join, dirname, resolve,
} from './_shared.mjs';
import { readdirSync, statSync, existsSync } from 'node:fs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);
const depth = parseInt(args.flags.depth ?? '4', 10);

const out = [];
out.push(header('Project structure', target, root));

// Tree
out.push('## Tree\n\n```');
out.push(rel(target, root) || '.');
out.push(...buildTree(target, '', depth));
out.push('```\n');

// File counts
const counts = {};
const sizes = {};
let totalFiles = 0, totalSize = 0;
for (const f of walkFiles(target)) {
  const ext = (extname(f) || '(none)').toLowerCase();
  counts[ext] = (counts[ext] || 0) + 1;
  const s = fileStats(f);
  if (s) { sizes[ext] = (sizes[ext] || 0) + s.size; totalSize += s.size; }
  totalFiles++;
}
out.push('## File counts by extension\n');
const rows = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([ext, n]) => [ext, n, fmtSize(sizes[ext] || 0)]);
out.push(mdTable(['Extension', 'Files', 'Size'], rows));
out.push(`\n**Total:** ${totalFiles} files, ${fmtSize(totalSize)}\n`);

// JS LOC
let jsLoc = 0, jsFiles = 0;
for (const f of walkFiles(target, { extensions: ['.js', '.mjs', '.cjs'] })) {
  const src = safeReadFile(f);
  if (!src) continue;
  jsFiles++;
  jsLoc += src.split(/\r?\n/).length;
}
out.push(`## JS lines of code\n\n- Files: **${jsFiles}**\n- Total lines: **${jsLoc}**\n`);

// Entry points
out.push('\n## Detected entry points\n');
const entries = detectEntries(root);
if (!entries.length) out.push('_(none detected)_');
else out.push(mdTable(['Kind', 'Path', 'Note'], entries));

writeOut(out.join('\n'), getOutPath(args));

// ---

function buildTree(dir, prefix, remaining) {
  if (remaining < 0) return [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
  entries = entries
    .filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const lines = [];
  entries.forEach((e, i) => {
    const last = i === entries.length - 1;
    const connector = last ? '└── ' : '├── ';
    const sub = last ? '    ' : '│   ';
    lines.push(prefix + connector + e.name + (e.isDirectory() ? '/' : ''));
    if (e.isDirectory() && remaining > 0) {
      lines.push(...buildTree(join(dir, e.name), prefix + sub, remaining - 1));
    } else if (e.isDirectory() && remaining === 0) {
      // show ellipsis to indicate truncated
      try {
        const inner = readdirSync(join(dir, e.name)).filter(n => !IGNORED_DIRS.has(n) && !n.startsWith('.'));
        if (inner.length) lines.push(prefix + sub + `… (${inner.length} more)`);
      } catch {}
    }
  });
  return lines;
}

function detectEntries(rootDir) {
  const found = [];
  const pkg = loadPackageJson(rootDir);
  if (pkg) {
    for (const field of ['main', 'module', 'bin', 'exports']) {
      if (pkg[field]) {
        const v = typeof pkg[field] === 'string' ? pkg[field] : JSON.stringify(pkg[field]);
        found.push([`package.json ${field}`, v, '']);
      }
    }
    if (pkg.scripts) {
      const interesting = Object.entries(pkg.scripts)
        .filter(([k]) => ['start', 'dev', 'serve', 'build'].includes(k));
      for (const [k, v] of interesting) found.push([`script:${k}`, v, '']);
    }
  }
  const candidates = [
    ['index.html', 'static entry'],
    ['server.js', 'node server'],
    ['server.mjs', 'node server'],
    ['app.js', 'node app'],
    ['app.mjs', 'node app'],
    ['main.js', 'js entry'],
    ['src/main.js', 'js entry'],
    ['src/index.js', 'js entry'],
    ['src/server.js', 'node server'],
    ['src/server.mjs', 'node server'],
    ['src/app.js', 'node app'],
    ['src/client/bootstrap.js', 'client bootstrap'],
  ];
  for (const [p, note] of candidates) {
    const abs = join(rootDir, p);
    if (existsSync(abs)) found.push(['file', p, note]);
  }
  return found;
}
