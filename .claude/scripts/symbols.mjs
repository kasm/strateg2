#!/usr/bin/env node
// symbols.mjs — exported symbols per file (ESM `export` + CJS `module.exports`).

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, parseJS, walkAst, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const fileSymbols = []; // { file, exports: [{name, kind, line}] }

for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const ast = parseJS(src, f);
  const exps = collectExports(ast);
  if (exps.length) fileSymbols.push({ file: rel(f, root), exports: exps });
}

const out = [];
out.push(header('Exported symbols', target, root));

if (!fileSymbols.length) {
  out.push('_(no exports found)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

out.push(`## ${fileSymbols.length} files with exports\n`);
for (const fs of fileSymbols) {
  out.push(`### ${fs.file}\n`);
  out.push(mdTable(['Name', 'Kind', 'Line'],
    fs.exports.map(e => [e.name, e.kind, e.line])));
  out.push('');
}

// Quick symbol index for grep-like lookup
out.push('\n## Flat index\n\n```');
const all = [];
for (const fs of fileSymbols) {
  for (const e of fs.exports) all.push(`${e.name}\t${e.kind}\t${fs.file}:${e.line}`);
}
all.sort();
out.push(...all);
out.push('```');

writeOut(out.join('\n'), getOutPath(args));

function collectExports(ast) {
  const exps = [];
  walkAst(ast, (node) => {
    const line = node.loc?.start.line ?? 0;
    // ESM
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const d = node.declaration;
        if (d.type === 'FunctionDeclaration' && d.id) exps.push({ name: d.id.name, kind: 'function', line });
        else if (d.type === 'ClassDeclaration' && d.id) exps.push({ name: d.id.name, kind: 'class', line });
        else if (d.type === 'VariableDeclaration') {
          for (const decl of d.declarations) {
            const n = nameOfPattern(decl.id);
            if (n) exps.push({ name: n, kind: d.kind, line });
          }
        }
      }
      if (node.specifiers) {
        for (const s of node.specifiers) {
          exps.push({ name: s.exported.name || s.exported.value, kind: node.source ? 're-export' : 'named', line });
        }
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      let label = 'default';
      if (node.declaration?.id?.name) label = `default (${node.declaration.id.name})`;
      else if (node.declaration?.name) label = `default (${node.declaration.name})`;
      exps.push({ name: label, kind: 'default', line });
    }
    if (node.type === 'ExportAllDeclaration') {
      const src = node.source?.value;
      exps.push({ name: '*', kind: `re-export from ${src}`, line });
    }
    // CJS: module.exports.X = ... ; module.exports = { a, b }
    if (node.type === 'AssignmentExpression' && node.operator === '=' && node.left?.type === 'MemberExpression') {
      const left = node.left;
      const isModuleExports = left.object?.type === 'MemberExpression'
        && left.object.object?.name === 'module' && left.object.property?.name === 'exports';
      const isExportsProp = left.object?.name === 'exports';
      if (isModuleExports || isExportsProp) {
        const propName = left.property?.name || left.property?.value;
        if (propName) exps.push({ name: propName, kind: 'cjs', line });
      }
      // module.exports = {...}
      const isRootModuleExports = left.object?.name === 'module' && left.property?.name === 'exports';
      if (isRootModuleExports && node.right?.type === 'ObjectExpression') {
        for (const p of node.right.properties) {
          if (p.key) exps.push({ name: p.key.name || p.key.value, kind: 'cjs', line: p.loc?.start.line ?? line });
        }
      }
    }
  });
  return exps;
}

function nameOfPattern(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') return '<destructured>';
  return null;
}
