#!/usr/bin/env node
// P8 — Determinism guard.
//
// The sim path must be deterministic — same inputs → same state, byte-for-byte —
// because the replay system and multiplayer lockstep depend on it. Comments in
// the code already assert this (see src/commands/restart.js:17, src/replay/checksum.js:7).
// This script enforces the assertion: any of the following in the sim path fail CI.
//
//   - Math.random()
//   - Date.now()
//   - performance.now()
//   - new Date(...)  — for both reading and stamping
//
// If a future feature genuinely needs randomness inside the sim, add a seeded RNG
// (e.g. src/core/rng.js, sourced from a seed in createGameState) and route through
// it. The check stays — Math.random is never the right answer in the sim path.
//
// Scope:
//   SCANNED = simulation code (sim, core, commands, modules, replay/reconstruct)
//   EXEMPT  = edge code (client, server, transport) and metadata-only timestamps
//             in replay/recorder.js (the `recordedAt` field is never read back).
//
// Usage: node .claude/scripts/check-determinism.mjs
// Exits 0 on no violations, 1 on violations, 2 on parse error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd().replace(/\\/g, '/');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

// Files matching any of these prefixes are scanned. Anything else is exempt.
const SCAN_PREFIXES = [
  'src/sim/',
  'src/core/',
  'src/commands/',
  'src/modules/',
];

// Files explicitly scanned even though they live in an otherwise-exempt subtree.
const SCAN_EXTRA_FILES = [
  'src/replay/reconstruct.js',  // replay = re-execute the sim, must be deterministic
];

// Files exempt from the scan even if they match SCAN_PREFIXES.
// Use sparingly — each entry must be justified in a comment.
const EXEMPT_FILES = new Set([
  // recorder writes a `recordedAt` ISO string into the saved replay metadata.
  // Replay reconstruction never reads it back — it's purely human-facing.
  'src/replay/recorder.js',
]);

// Per-line allowlist: `${file}:${line}` strings that are known-OK. Use sparingly.
const EXEMPT_LINES = new Set([
  // (none currently)
]);

function memberChainString(node) {
  if (!node) return '?';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression') {
    const left = memberChainString(node.object);
    const right = node.computed ? '[?]' : (node.property?.type === 'Identifier' ? node.property.name : '[?]');
    return left + '.' + right;
  }
  return '?';
}

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

function shouldScan(rel) {
  if (EXEMPT_FILES.has(rel)) return false;
  if (SCAN_PREFIXES.some(p => rel.startsWith(p))) return true;
  if (SCAN_EXTRA_FILES.includes(rel)) return true;
  return false;
}

const violations = [];

for (const file of walkFiles(SRC)) {
  const rel = relPath(file);
  if (!shouldScan(rel)) continue;

  let source;
  let ast;
  try {
    source = readFileSync(file, 'utf8');
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.error(`[check-determinism] parse error in ${rel}: ${e.message}`);
    process.exit(2);
  }

  walk(ast, (node) => {
    // Math.random / Date.now / performance.now — CallExpression with these callees
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const chain = memberChainString(node.callee);
      const line = node.loc.start.line;
      const key = `${rel}:${line}`;
      if (EXEMPT_LINES.has(key)) return;
      if (chain === 'Math.random' || chain === 'Date.now' || chain === 'performance.now') {
        violations.push({ file: rel, line, kind: 'forbidden-call', detail: chain + '()' });
      }
    }
    // new Date(...) — NewExpression whose callee is the Date identifier
    if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'Date') {
      const line = node.loc.start.line;
      const key = `${rel}:${line}`;
      if (EXEMPT_LINES.has(key)) return;
      violations.push({ file: rel, line, kind: 'forbidden-new', detail: 'new Date(...)' });
    }
  });
}

if (violations.length === 0) {
  console.log(`[check-determinism] OK — sim path is free of Math.random / Date.now / performance.now / new Date.`);
  process.exit(0);
}

console.error('[check-determinism] VIOLATIONS:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.kind.padEnd(15)} ${v.detail}`);
}
console.error(`\nTotal: ${violations.length} violation(s)`);
console.error(`\nSee plan: P8 Determinism Guard.`);
console.error(`Fix options:`);
console.error(`  1. Remove the non-deterministic call. The sim path must be pure.`);
console.error(`  2. If you genuinely need randomness, introduce src/core/rng.js (createRng(seed))`);
console.error(`     and pull from state.rng. Date/performance.now have no legitimate sim use.`);
console.error(`  3. If the call is metadata-only and never affects sim behavior, add the file to`);
console.error(`     EXEMPT_FILES or the line to EXEMPT_LINES with a comment justifying why.`);
process.exit(1);
