#!/usr/bin/env node
// routes.mjs — HTTP routes for express/koa/fastify/hapi-style patterns.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

// Pattern catalogue. Each is { kind, regex, methodGroup?, pathGroup }.
const patterns = [
  // express/koa-router: app.get('/path', ...), router.post('/x', ...)
  { kind: 'express/router',
    re: /\b(?:app|router|api|server)\.(get|post|put|patch|delete|head|options|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1, pathGroup: 2 },
  // fastify: fastify.get('/x'), fastify.route({ method:'GET', url:'/x' })
  { kind: 'fastify',
    re: /\bfastify\.(get|post|put|patch|delete|head|options|all)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: 1, pathGroup: 2 },
  { kind: 'fastify.route',
    re: /\bfastify\.route\s*\(\s*\{[^}]*method\s*:\s*['"`]([A-Z]+)['"`][^}]*url\s*:\s*['"`]([^'"`]+)['"`]/gs,
    methodGroup: 1, pathGroup: 2 },
  // hapi: server.route({ method, path })
  { kind: 'hapi',
    re: /\bserver\.route\s*\(\s*\{[^}]*method\s*:\s*['"`]([A-Z]+)['"`][^}]*path\s*:\s*['"`]([^'"`]+)['"`]/gs,
    methodGroup: 1, pathGroup: 2 },
  // generic: createServer / http.createServer — flag as "raw http"
  { kind: 'raw http',
    re: /\b(?:http|https)\.createServer\s*\(/g,
    methodGroup: null, pathGroup: null, raw: true },
  // socket.io namespaces / events
  { kind: 'socket.io event',
    re: /\b(?:socket|io|nsp)\.on\s*\(\s*['"`]([^'"`]+)['"`]/g,
    methodGroup: null, pathGroup: 1, raw: true, label: 'event' },
];

const hits = [];
for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  const src = safeReadFile(f);
  if (!src) continue;
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({
        file: rel(f, root),
        line,
        kind: p.kind,
        method: p.methodGroup ? m[p.methodGroup].toUpperCase() : (p.label || '—'),
        path: p.pathGroup ? m[p.pathGroup] : '—',
      });
    }
  }
}

const out = [];
out.push(header('HTTP routes and server endpoints', target, root));

if (!hits.length) {
  out.push('_(no server routes detected — appears to be a client-only project)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const byKind = {};
for (const h of hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
out.push('## Summary by framework\n');
out.push(mdTable(['Kind', 'Endpoints'], Object.entries(byKind).sort((a, b) => b[1] - a[1])));

out.push('\n## All endpoints\n');
hits.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
out.push(mdTable(
  ['Kind', 'Method/Event', 'Path', 'Location'],
  hits.map(h => [h.kind, h.method, h.path, `${h.file}:${h.line}`])
));

writeOut(out.join('\n'), getOutPath(args));
