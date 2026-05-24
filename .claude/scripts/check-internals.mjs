#!/usr/bin/env node
// P5 — Explicit Internals.
//
// Files named `*.internal.js` are implementation details of their module. They
// may only be imported from within the SAME directory — never reached across
// module boundaries.
//
// Why: AI agents (and humans) need a reliable signal for "where the public
// surface ends." If anything-with-an-`index.js` can be imported piecewise from
// anywhere, the public/private contract collapses and context bundling loses
// its bottom edge. The `.internal.js` suffix + this check make the contract
// machine-checkable.
//
// Rule: an import of `<path>.internal.js` is legal iff `<path>` matches
// `^\\.\\/[^/]+$` (relative, same directory, no slashes after `./`).
//
// Usage: node .claude/scripts/check-internals.mjs
// Exits 0 on no violations, 1 on violations, 2 on parse error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd().replace(/\\/g, '/');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

// Matches `./<name>.internal.js` with no additional slashes (same directory only).
const SAME_DIR_INTERNAL_RE = /^\.\/[^/]+\.internal\.js$/;

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    walk(node[key], visit);
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry).replace(/\\/g, '/');
    const st = statSync(full);
    if (st.isDirectory()) { yield* walkFiles(full); }
    else if (full.endsWith('.js') || full.endsWith('.mjs')) { yield full; }
  }
}

function relPath(absPath) {
  return absPath.replace(ROOT + '/', '');
}

function checkImportPath(importPath) {
  // Only care about imports targeting *.internal.js files.
  if (!importPath.endsWith('.internal.js')) return { ok: true };
  if (SAME_DIR_INTERNAL_RE.test(importPath)) return { ok: true };
  return { ok: false, reason: 'cross-directory import of an internal file' };
}

const violations = [];

for (const file of walkFiles(SRC)) {
  const rel = relPath(file);

  let source;
  let ast;
  try {
    source = readFileSync(file, 'utf8');
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.error(`[check-internals] parse error in ${rel}: ${e.message}`);
    process.exit(2);
  }

  walk(ast, (node) => {
    // Static imports: `import ... from '...'`
    if (node.type === 'ImportDeclaration' && typeof node.source?.value === 'string') {
      const path = node.source.value;
      const r = checkImportPath(path);
      if (!r.ok) {
        violations.push({ file: rel, line: node.loc.start.line, path, reason: r.reason });
      }
    }
    // Dynamic imports: `import('...')`
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal' && typeof node.source.value === 'string') {
      const path = node.source.value;
      const r = checkImportPath(path);
      if (!r.ok) {
        violations.push({ file: rel, line: node.loc.start.line, path, reason: r.reason });
      }
    }
    // Re-exports: `export ... from '...'`
    if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration')
        && typeof node.source?.value === 'string') {
      const path = node.source.value;
      const r = checkImportPath(path);
      if (!r.ok) {
        violations.push({ file: rel, line: node.loc.start.line, path, reason: r.reason });
      }
    }
  });
}

if (violations.length === 0) {
  console.log(`[check-internals] OK — all *.internal.js imports are same-directory.`);
  process.exit(0);
}

console.error('[check-internals] VIOLATIONS:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  imports "${v.path}" — ${v.reason}`);
}
console.error(`\nTotal: ${violations.length} violation(s)`);
console.error(`\nSee plan: P5 Explicit Internals.`);
console.error(`Fix options:`);
console.error(`  1. Promote the function to the target module's public API (its index.js)`);
console.error(`     and import from there.`);
console.error(`  2. Move the function to a shared, non-internal file.`);
console.error(`  3. Rename the target file if it should not have been marked internal.`);
process.exit(1);
