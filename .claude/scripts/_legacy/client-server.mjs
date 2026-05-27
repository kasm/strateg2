#!/usr/bin/env node
// client-server.mjs — classify JS files as server / client / shared based on imports and DOM globals.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, parseJS, walkAst, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const SERVER_IMPORTS = new Set([
  'fs', 'fs/promises', 'http', 'https', 'http2', 'net', 'tls', 'dns',
  'child_process', 'cluster', 'worker_threads', 'os', 'process',
  'stream', 'readline', 'tty', 'v8', 'vm', 'perf_hooks',
  'express', 'koa', 'fastify', 'hapi', '@hapi/hapi', 'restify',
  'socket.io', 'ws', 'mongoose', 'pg', 'mysql', 'mysql2', 'sqlite3',
  'redis', 'ioredis', 'nodemailer', 'bcrypt', 'argon2', 'jsonwebtoken',
  'sequelize', 'knex', 'prisma', '@prisma/client',
]);
const SERVER_PREFIXES = ['node:'];
const DOM_GLOBALS = /\b(document|window|navigator|localStorage|sessionStorage|location|history|fetch|requestAnimationFrame|HTMLElement|customElements|CanvasRenderingContext2D|WebGL2RenderingContext|WebGLRenderingContext)\b/;

const results = [];
for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const ast = parseJS(src, f);
  const imports = [];
  walkAst(ast, (node) => {
    if (node.type === 'ImportDeclaration' && node.source) imports.push(node.source.value);
    if (node.type === 'CallExpression' && node.callee?.name === 'require'
        && node.arguments?.[0]?.type === 'Literal') imports.push(node.arguments[0].value);
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') imports.push(node.source.value);
  });
  let serverHit = false, serverEvidence = '';
  for (const imp of imports) {
    if (!imp || typeof imp !== 'string') continue;
    const bare = imp.startsWith('node:') ? imp.slice(5) : imp;
    if (SERVER_PREFIXES.some(p => imp.startsWith(p)) || SERVER_IMPORTS.has(bare)) {
      serverHit = true; serverEvidence = imp; break;
    }
  }
  const domMatch = src.match(DOM_GLOBALS);
  let kind;
  if (serverHit && domMatch) kind = 'mixed (suspicious)';
  else if (serverHit) kind = 'server';
  else if (domMatch) kind = 'client';
  else kind = 'shared';
  results.push({
    file: rel(f, root),
    kind,
    evidence: serverHit ? `import: ${serverEvidence}` : (domMatch ? `global: ${domMatch[0]}` : '—'),
  });
}

const out = [];
out.push(header('Client / server classification', target, root));

const byKind = {};
for (const r of results) byKind[r.kind] = (byKind[r.kind] || 0) + 1;

out.push('## Summary\n');
out.push(mdTable(['Kind', 'Files'], Object.entries(byKind).sort((a, b) => b[1] - a[1])));

if (!byKind.server && !byKind['mixed (suspicious)']) {
  out.push('\n_No server-side code detected — this appears to be a client-only project._\n');
}
if (byKind['mixed (suspicious)']) {
  out.push('\n_Note: files marked **mixed** import server modules AND use DOM globals. These usually indicate a bug or accidental cross-environment coupling._\n');
}

for (const kind of ['server', 'mixed (suspicious)', 'client', 'shared']) {
  const sub = results.filter(r => r.kind === kind);
  if (!sub.length) continue;
  out.push(`\n## ${kind} (${sub.length})\n`);
  out.push(mdTable(['File', 'Evidence'], sub.slice(0, 100).map(r => [r.file, r.evidence])));
  if (sub.length > 100) out.push(`\n_(showing 100 of ${sub.length})_`);
}

writeOut(out.join('\n'), getOutPath(args));
