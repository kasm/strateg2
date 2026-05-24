#!/usr/bin/env node
// graph.mjs — file-to-file import graph (ESM + CJS). Adjacency list + cycles + hubs.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, parseJS, walkAst, resolveImport,
  getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

// Build adjacency
const graph = {};      // absPath -> Set(absPath)
const reverse = {};    // absPath -> Set(absPath)
const externals = {};  // absPath -> Set(specifier)
const fileList = [];

for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  fileList.push(f);
  graph[f] = new Set();
  externals[f] = new Set();
  reverse[f] ||= new Set();
}

for (const f of fileList) {
  const src = safeReadFile(f);
  if (!src) continue;
  const ast = parseJS(src, f);
  walkAst(ast, (node) => {
    let spec = null;
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration') && node.source) {
      spec = node.source.value;
    } else if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      spec = node.source.value;
    } else if (node.type === 'CallExpression' && node.callee?.name === 'require'
        && node.arguments?.[0]?.type === 'Literal') {
      spec = node.arguments[0].value;
    }
    if (!spec || typeof spec !== 'string') return;
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const resolved = resolveImport(spec, f);
      if (resolved) {
        graph[f].add(resolved);
        reverse[resolved] ||= new Set();
        reverse[resolved].add(f);
      } else {
        externals[f].add(spec + ' [unresolved]');
      }
    } else {
      externals[f].add(spec);
    }
  });
}

const out = [];
out.push(header('Import graph', target, root));
out.push(`## Stats\n\n- JS files scanned: **${fileList.length}**\n- Internal edges: **${Object.values(graph).reduce((s, v) => s + v.size, 0)}**`);

// Cycles via DFS
const cycles = findCycles(graph);
out.push(`\n## Circular dependencies\n`);
if (!cycles.length) out.push('_(none)_');
else {
  for (const c of cycles.slice(0, 20)) {
    out.push('- ' + c.map(p => rel(p, root)).join(' → ') + ' → ' + rel(c[0], root));
  }
  if (cycles.length > 20) out.push(`\n_(showing 20 of ${cycles.length})_`);
}

// Hub files (most imported)
const inDeg = fileList.map(f => ({ file: f, n: (reverse[f]?.size || 0) }))
  .filter(x => x.n > 0)
  .sort((a, b) => b.n - a.n);
out.push(`\n\n## Most imported files (hubs)\n`);
out.push(mdTable(['File', 'Imported by N files'],
  inDeg.slice(0, 20).map(x => [rel(x.file, root), x.n])));

// Files with most outgoing imports
const outDeg = fileList.map(f => ({ file: f, n: graph[f].size }))
  .filter(x => x.n > 0)
  .sort((a, b) => b.n - a.n);
out.push(`\n## Largest fan-out (files importing many others)\n`);
out.push(mdTable(['File', 'Imports N internal files'],
  outDeg.slice(0, 20).map(x => [rel(x.file, root), x.n])));

// Adjacency list
out.push('\n## Adjacency (file → imports)\n');
out.push('```');
for (const f of fileList) {
  const internal = [...graph[f]].map(p => rel(p, root)).sort();
  const ext = [...externals[f]].sort();
  if (!internal.length && !ext.length) continue;
  out.push(rel(f, root));
  for (const i of internal) out.push('  → ' + i);
  for (const e of ext) out.push('  ⇢ ' + e + ' (external)');
}
out.push('```');

// Orphans
const orphans = fileList.filter(f => (reverse[f]?.size || 0) === 0 && graph[f].size === 0);
if (orphans.length) {
  out.push(`\n## Orphan files (no imports in, no imports out)\n`);
  for (const f of orphans.slice(0, 30)) out.push('- ' + rel(f, root));
}

writeOut(out.join('\n'), getOutPath(args));

// Tarjan SCC for cycle detection
function findCycles(g) {
  const idx = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  let counter = 0;
  const sccs = [];

  function strongconnect(v) {
    idx.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v); onStack.add(v);
    for (const w of g[v] || []) {
      if (!idx.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)));
      }
    }
    if (low.get(v) === idx.get(v)) {
      const scc = [];
      while (true) {
        const w = stack.pop(); onStack.delete(w); scc.push(w);
        if (w === v) break;
      }
      if (scc.length > 1) sccs.push(scc.reverse());
      else if (scc.length === 1 && (g[scc[0]]?.has(scc[0]))) sccs.push(scc); // self-loop
    }
  }
  for (const v of Object.keys(g)) {
    if (!idx.has(v)) strongconnect(v);
  }
  return sccs;
}
