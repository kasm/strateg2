#!/usr/bin/env node
// map.mjs — minimal project map. One line per file: path | LOC | exports.
//
// Budget: <2 KB for a module-scoped run (~6 files), <6 KB for whole src/.
// Designed to complement Read/Grep, not replace them.
//
// Usage:
//   node .claude/scripts/map.mjs                       # whole project (defaults to src/)
//   node .claude/scripts/map.mjs src/modules/units     # one directory or file
//   node .claude/scripts/map.mjs --no-exports          # paths + LOC only
//   node .claude/scripts/map.mjs --depth 2             # truncate at directory depth
//   node .claude/scripts/map.mjs --json                # JSON Lines

import { readFileSync, existsSync, statSync } from 'node:fs';
import { relative, sep, resolve } from 'node:path';
import {
  walkFiles, parseJS, walkAst, parseArgs,
  getProjectRoot, JS_EXTS, rel,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const targetArg = args._[0] ?? 'src';
const target = resolve(root, targetArg);
const showExports = args.flags['no-exports'] !== true;
const showLoc     = args.flags['no-loc']     !== true;
const asJson      = args.flags.json === true;
const depth       = args.flags.depth ? parseInt(args.flags.depth, 10) : Infinity;
const quiet       = args.flags.quiet === true;

if (!existsSync(target)) {
  process.stderr.write(`map: target not found: ${targetArg}\n`);
  process.exit(2);
}

const baseDepth = relative(root, target).split(sep).filter(Boolean).length;

const t0 = Date.now();
let fileCount = 0;
const lines = [];

for (const abs of walkFiles(target, { extensions: JS_EXTS })) {
  const r = rel(abs, root);
  const fileDepth = r.split('/').length;
  if (fileDepth - baseDepth > depth) continue;
  fileCount++;

  const source = readFileSync(abs, 'utf8');
  const loc = source ? source.split('\n').length : 0;
  const exports = showExports ? collectExports(source) : null;

  if (asJson) {
    lines.push(JSON.stringify({ path: r, loc, exports }));
  } else {
    const parts = [r];
    if (showLoc) parts.push(`${loc} LOC`);
    if (showExports) parts.push(exports.length ? `exports: ${exports.join(', ')}` : 'no exports');
    lines.push(parts.join(' | '));
  }
}

process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''));
if (!quiet) {
  process.stderr.write(`# map: ${fileCount} files in ${rel(target, root)} (${Date.now() - t0} ms)\n`);
}

// --- helpers ---

function collectExports(source) {
  const ast = parseJS(source);
  if (ast._parseError) return ['<parse error>'];
  const out = [];
  for (const node of ast.body || []) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        for (const name of declNames(node.declaration)) out.push(name);
      }
      for (const spec of node.specifiers || []) {
        const name = spec.exported?.name;
        if (name) out.push(name);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      const name = node.declaration?.id?.name || '<default>';
      out.push(`default(${name})`);
    } else if (node.type === 'ExportAllDeclaration') {
      out.push(`* from '${node.source?.value ?? '?'}'`);
    }
  }
  return out;
}

function declNames(decl) {
  if (!decl) return [];
  if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
    return decl.id?.name ? [decl.id.name] : [];
  }
  if (decl.type === 'VariableDeclaration') {
    const names = [];
    for (const d of decl.declarations) {
      if (d.id?.type === 'Identifier') names.push(d.id.name);
      else if (d.id?.type === 'ObjectPattern') {
        for (const p of d.id.properties) {
          if (p.key?.type === 'Identifier') names.push(p.key.name);
        }
      }
    }
    return names;
  }
  return [];
}
