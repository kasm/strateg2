#!/usr/bin/env node
// deps.mjs — npm dependencies vs actual import usage.

import {
  getProjectRoot, loadPackageJson, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, parseJS, walkAst, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const pkg = loadPackageJson(root);
const out = [];
out.push(header('Dependencies vs. usage', target, root));

if (!pkg) {
  out.push('_(no package.json found)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const declared = {
  deps: pkg.dependencies || {},
  devDeps: pkg.devDependencies || {},
  peer: pkg.peerDependencies || {},
  optional: pkg.optionalDependencies || {},
};

// Collect all bare-specifier imports in JS files
const importsByPkg = {}; // pkgName -> [{file, line}]
const builtinSet = new Set([
  'fs', 'path', 'os', 'url', 'http', 'https', 'http2', 'crypto', 'stream',
  'child_process', 'events', 'util', 'buffer', 'querystring', 'zlib',
  'assert', 'dns', 'net', 'tls', 'cluster', 'process', 'readline',
  'timers', 'string_decoder', 'worker_threads', 'perf_hooks', 'vm',
  'module', 'constants', 'punycode', 'inspector', 'async_hooks', 'tty',
]);

for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const ast = parseJS(src, f);
  collectBareSpecifiers(ast, src).forEach(({ spec, line }) => {
    if (!spec) return;
    if (spec.startsWith('.') || spec.startsWith('/')) return;
    let name = spec;
    if (name.startsWith('node:')) name = name.slice(5);
    // strip subpath: 'foo/bar' -> 'foo', '@scope/pkg/sub' -> '@scope/pkg'
    if (name.startsWith('@')) {
      const parts = name.split('/');
      name = parts.slice(0, 2).join('/');
    } else {
      name = name.split('/')[0];
    }
    if (builtinSet.has(name)) return;
    if (!importsByPkg[name]) importsByPkg[name] = [];
    importsByPkg[name].push({ file: rel(f, root), line });
  });
}

const used = new Set(Object.keys(importsByPkg));
const allDeclared = new Set([
  ...Object.keys(declared.deps),
  ...Object.keys(declared.devDeps),
  ...Object.keys(declared.peer),
  ...Object.keys(declared.optional),
]);

out.push('## Declared dependencies\n');
out.push(mdTable(['Name', 'Version', 'Section', 'Usage count', 'First seen'],
  [...Object.entries(declared.deps).map(([n, v]) => row(n, v, 'dependencies')),
   ...Object.entries(declared.devDeps).map(([n, v]) => row(n, v, 'devDependencies')),
   ...Object.entries(declared.peer).map(([n, v]) => row(n, v, 'peer')),
   ...Object.entries(declared.optional).map(([n, v]) => row(n, v, 'optional'))]));

const unused = [...allDeclared].filter(n => !used.has(n));
out.push('\n## Unused (declared but not imported)\n');
out.push(unused.length ? unused.map(n => `- ${n}`).join('\n') : '_(none)_');

const missing = [...used].filter(n => !allDeclared.has(n));
out.push('\n\n## Missing (imported but not declared)\n');
out.push(missing.length
  ? mdTable(['Package', 'First seen'], missing.map(n => [n, `${importsByPkg[n][0].file}:${importsByPkg[n][0].line}`]))
  : '_(none)_');

writeOut(out.join('\n'), getOutPath(args));

function row(name, ver, section) {
  const refs = importsByPkg[name] || [];
  return [name, ver, section, refs.length, refs[0] ? `${refs[0].file}:${refs[0].line}` : '—'];
}

function collectBareSpecifiers(ast, src) {
  const found = [];
  const requireMatcher = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  // ESM via AST
  walkAst(ast, (node) => {
    if (node.type === 'ImportDeclaration' && node.source && typeof node.source.value === 'string') {
      found.push({ spec: node.source.value, line: node.loc?.start.line ?? 0 });
    }
    if (node.type === 'ExportAllDeclaration' && node.source) {
      found.push({ spec: node.source.value, line: node.loc?.start.line ?? 0 });
    }
    if (node.type === 'ExportNamedDeclaration' && node.source) {
      found.push({ spec: node.source.value, line: node.loc?.start.line ?? 0 });
    }
    if (node.type === 'ImportExpression' && node.source?.type === 'Literal') {
      found.push({ spec: node.source.value, line: node.loc?.start.line ?? 0 });
    }
    if (node.type === 'CallExpression' && node.callee?.name === 'require'
        && node.arguments?.[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string') {
      found.push({ spec: node.arguments[0].value, line: node.loc?.start.line ?? 0 });
    }
  });
  // CJS regex fallback (in case parse failed or was script mode)
  if (ast._parseError) {
    let m;
    while ((m = requireMatcher.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      found.push({ spec: m[1], line });
    }
  }
  return found;
}
