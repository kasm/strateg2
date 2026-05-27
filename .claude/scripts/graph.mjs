#!/usr/bin/env node
// graph.mjs — file-level import graph queries. One edge per line.
//
// Budget: <2 KB for module-scoped queries; <5 KB for project-wide.
//
// Usage:
//   node .claude/scripts/graph.mjs in <file>        # files imported by <file>
//   node .claude/scripts/graph.mjs out <file>       # files that import <file>
//   node .claude/scripts/graph.mjs cycles [scope]   # import cycles (one per line)
//   node .claude/scripts/graph.mjs hubs [N] [scope] # top-N most-imported files
//   node .claude/scripts/graph.mjs orphans [scope]  # files nothing imports

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  walkFiles, parseJS, walkAst, parseArgs,
  getProjectRoot, JS_EXTS, rel, resolveImport,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const subcommand = args._[0];
const asJson = args.flags.json === true;
const quiet = args.flags.quiet === true;

if (!subcommand) {
  process.stderr.write(`graph: subcommand required. Try: in | out | cycles | hubs | orphans\n`);
  process.exit(2);
}

const t0 = Date.now();
const scope = pickScope(subcommand, args);
const graph = buildGraph(scope);
const reverseGraph = invert(graph);

let lines = [];
switch (subcommand) {
  case 'in':       lines = cmdIn(args._[1]); break;
  case 'out':      lines = cmdOut(args._[1]); break;
  case 'cycles':   lines = cmdCycles(); break;
  case 'hubs':     lines = cmdHubs(args._[1]); break;
  case 'orphans':  lines = cmdOrphans(); break;
  default:
    process.stderr.write(`graph: unknown subcommand "${subcommand}"\n`);
    process.exit(2);
}

process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''));
if (!quiet) {
  process.stderr.write(`# graph ${subcommand}: ${lines.length} result(s), ${graph.size} files (${Date.now() - t0} ms)\n`);
}

// --- subcommands ---

function cmdIn(fileArg) {
  if (!fileArg) die('graph in: file argument required');
  const abs = resolve(root, fileArg);
  if (!graph.has(abs)) die(`graph in: ${fileArg} not in scope (or not parsed)`);
  return [...graph.get(abs)].sort().map(t => fmtEdge(abs, t, '->'));
}

function cmdOut(fileArg) {
  if (!fileArg) die('graph out: file argument required');
  const abs = resolve(root, fileArg);
  if (!reverseGraph.has(abs)) {
    if (!existsSync(abs)) die(`graph out: ${fileArg} does not exist`);
    return [];
  }
  return [...reverseGraph.get(abs)].sort().map(c => fmtEdge(c, abs, '->'));
}

function cmdCycles() {
  const cycles = findCycles(graph);
  return cycles.map(cyc => {
    if (asJson) return JSON.stringify({ cycle: cyc.map(a => rel(a, root)) });
    return cyc.concat(cyc[0]).map(a => rel(a, root)).join(' -> ');
  });
}

function cmdHubs(nArg) {
  const n = nArg ? parseInt(nArg, 10) : 20;
  const counts = [];
  for (const [target, callers] of reverseGraph) {
    counts.push({ target, count: callers.size });
  }
  counts.sort((a, b) => b.count - a.count);
  return counts.slice(0, n).map(({ target, count }) =>
    asJson
      ? JSON.stringify({ path: rel(target, root), importers: count })
      : `${count} <- ${rel(target, root)}`
  );
}

function cmdOrphans() {
  const out = [];
  for (const abs of graph.keys()) {
    if (!reverseGraph.has(abs)) out.push(rel(abs, root));
  }
  out.sort();
  return out.map(p => asJson ? JSON.stringify({ path: p }) : p);
}

// --- graph build ---

function buildGraph(scopeAbs) {
  const g = new Map();
  for (const abs of walkFiles(scopeAbs, { extensions: JS_EXTS })) {
    const source = safeRead(abs);
    if (source == null) continue;
    const ast = parseJS(source, abs);
    const targets = new Set();
    walkAst(ast, (node) => {
      let spec = null;
      if (node.type === 'ImportDeclaration') spec = node.source?.value;
      else if (node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') {
        spec = node.source?.value;
      } else if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
        spec = node.source.value;
      }
      if (spec) {
        const resolved = resolveImport(spec, abs);
        if (resolved) targets.add(resolved);
      }
    });
    g.set(abs, targets);
  }
  return g;
}

function invert(g) {
  const r = new Map();
  for (const [from, tos] of g) {
    for (const to of tos) {
      if (!r.has(to)) r.set(to, new Set());
      r.get(to).add(from);
    }
  }
  return r;
}

function findCycles(g) {
  const cycles = [];
  const seenKey = new Set();
  const stack = [];
  const onStack = new Set();
  const visited = new Set();

  function dfs(node) {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const next of g.get(node) || []) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (onStack.has(next)) {
        const start = stack.indexOf(next);
        if (start !== -1) {
          const cyc = stack.slice(start);
          const key = canonicalCycleKey(cyc);
          if (!seenKey.has(key)) { seenKey.add(key); cycles.push(cyc); }
        }
      }
    }
    stack.pop();
    onStack.delete(node);
  }

  for (const node of g.keys()) if (!visited.has(node)) dfs(node);
  return cycles;
}

function canonicalCycleKey(cyc) {
  const minIdx = cyc.reduce((mi, v, i) => v < cyc[mi] ? i : mi, 0);
  const rotated = cyc.slice(minIdx).concat(cyc.slice(0, minIdx));
  return rotated.join('|');
}

// --- helpers ---

function pickScope(sub, _args) {
  if (sub === 'cycles' || sub === 'orphans') {
    return resolve(root, _args._[1] ?? 'src');
  }
  if (sub === 'hubs') {
    return resolve(root, _args._[2] ?? 'src');
  }
  return resolve(root, _args.flags.scope || 'src');
}

function fmtEdge(from, to, arrow) {
  if (asJson) return JSON.stringify({ from: rel(from, root), to: rel(to, root) });
  return `${rel(from, root)} ${arrow} ${rel(to, root)}`;
}

function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}
