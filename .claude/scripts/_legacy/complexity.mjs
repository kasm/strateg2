#!/usr/bin/env node
// complexity.mjs — per-file metrics: LOC, function/class count, max nesting depth, longest function.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, parseJS, walkAst, getTargetPath, getOutPath, header,
  JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);
const topN = parseInt(args.flags.top ?? '30', 10);

const results = [];
for (const f of walkFiles(target, { extensions: JS_EXTS })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const lines = src.split(/\r?\n/).length;
  const ast = parseJS(src, f);
  const m = collectMetrics(ast);
  results.push({
    file: rel(f, root),
    loc: lines,
    funcs: m.funcs,
    classes: m.classes,
    maxDepth: m.maxDepth,
    longestFn: m.longestFn,
    score: lines + m.funcs * 5 + m.classes * 10 + m.maxDepth * 8 + m.longestFn * 0.5,
    parseError: ast._parseError || null,
  });
}

results.sort((a, b) => b.score - a.score);

const out = [];
out.push(header('Complexity', target, root));
out.push(`## Top ${Math.min(topN, results.length)} files by composite complexity\n`);
out.push('Score = LOC + 5×funcs + 10×classes + 8×max-nesting + 0.5×longest-fn-lines\n');
out.push(mdTable(
  ['File', 'LOC', 'Funcs', 'Classes', 'Max nest', 'Longest fn', 'Score'],
  results.slice(0, topN).map(r => [r.file, r.loc, r.funcs, r.classes, r.maxDepth, r.longestFn, Math.round(r.score)])
));

const errors = results.filter(r => r.parseError);
if (errors.length) {
  out.push('\n## Parse errors\n');
  out.push(mdTable(['File', 'Error'], errors.map(e => [e.file, e.parseError])));
}

out.push(`\n**Totals:** ${results.length} JS files, ${results.reduce((s, r) => s + r.loc, 0)} LOC, ${results.reduce((s, r) => s + r.funcs, 0)} functions, ${results.reduce((s, r) => s + r.classes, 0)} classes.`);

writeOut(out.join('\n'), getOutPath(args));

function collectMetrics(ast) {
  let funcs = 0, classes = 0, maxDepth = 0, longestFn = 0;
  let depth = 0;
  const stack = [];

  const recurse = (node, parent) => {
    if (!node || typeof node !== 'object' || !node.type) return;
    const isFn = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);
    const isClass = ['ClassDeclaration', 'ClassExpression'].includes(node.type);
    const isBlock = ['BlockStatement', 'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement', 'SwitchStatement', 'TryStatement'].includes(node.type);
    if (isFn) {
      funcs++;
      if (node.loc) longestFn = Math.max(longestFn, node.loc.end.line - node.loc.start.line + 1);
    }
    if (isClass) classes++;
    if (isBlock) {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach(c => recurse(c, node));
      else if (v && typeof v === 'object' && v.type) recurse(v, node);
    }
    if (isBlock) depth--;
  };
  recurse(ast, null);
  return { funcs, classes, maxDepth, longestFn };
}
