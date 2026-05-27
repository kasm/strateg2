#!/usr/bin/env node
// ast.mjs — AST analysis service. Symbol-aware lookup + code-flow tracing.
//
// One subcommand, one question, one match per line. stdout is results only.
//
// Budget: <1 KB for most module-scoped queries; trace/path can exceed 5 KB
// at high --depth — use --depth 1 or 2 first.
//
// Caveat: reference resolution is *scope-naive* (matched by name). The same
// identifier name in two scopes is reported in both; disambiguate with
// --context 1 or by inspecting the line. Adding a scope tracker is a fast
// follow-up if false positives bite.
//
// Usage:
//   node .claude/scripts/ast.mjs <subcommand> <args> [--flags]
//
// Subcommands:
//   defs <name>             where <name> is declared
//   refs <name>             where <name> is referenced (excludes declarations)
//   calls <name>            who calls <name> (and from what enclosing fn)
//   callees <name>          what does <name> call
//   trace <name>            recursive call tree from <name>
//   path <from> <to>        call paths from <from> to <to>
//   writes <pattern>        assignments to a state path (e.g. 'state.units.*')
//   slice fn <name>         print just <name>'s source body
//   slice imports <file>    print just the import statements
//   slice exports <file>    print just the export statements
//
// Flags (all subcommands):
//   --scope <dir>      restrict files to this directory (default: src)
//   --ignore <glob>    additional ignore glob (default: tests/, *.test.js)
//   --depth N          max depth for trace/path (default: 3)
//   --context N        include ±N source lines around each hit
//   --json             emit JSON Lines instead of flat text
//   --quiet            suppress trailing summary

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  walkFiles, parseJS, parseArgs,
  getProjectRoot, JS_EXTS, rel,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const subcommand = args._[0];
const asJson = args.flags.json === true;
const quiet  = args.flags.quiet === true;
const depth  = args.flags.depth ? parseInt(args.flags.depth, 10) : 3;
const contextLines = args.flags.context ? parseInt(args.flags.context, 10) : 0;
const scopeArg = args.flags.scope || 'src';
const scope = resolve(root, scopeArg);
const ignoreGlobs = ['tests/', '/tests/', '.test.js', '.spec.js'];
if (typeof args.flags.ignore === 'string') ignoreGlobs.push(args.flags.ignore);

if (!subcommand) {
  process.stderr.write(`ast: subcommand required. Try: defs | refs | calls | callees | trace | path | writes | slice\n`);
  process.exit(2);
}

// --- loader (shared across subcommands that need the whole scope) ---

let _loaded = null;
function loadScope() {
  if (_loaded) return _loaded;
  const files = [];
  for (const abs of walkFiles(scope, { extensions: JS_EXTS })) {
    const r = rel(abs, root);
    if (ignoreGlobs.some(g => r.includes(g))) continue;
    const source = safeRead(abs);
    if (source == null) continue;
    const ast = parseJS(source, abs);
    files.push({ abs, rel: r, source, ast, lines: source.split('\n') });
  }
  _loaded = files;
  return files;
}

let _index = null;
function buildIndex() {
  if (_index) return _index;
  const files = loadScope();
  const defs = new Map();       // name -> [{file, line, col, kind, exported, node}]
  const refs = new Map();       // name -> [{file, line, col, enclosingFn}]
  const calls = [];             // {file, line, col, callee, enclosingFn, isMethod}
  const fnDefs = new Map();     // name -> [{file, node, source, lines}] (functions only, callable)
  const assignments = [];       // {file, line, col, chain, kind}
  const importEdges = new Map();// file -> [{ specifier, localName, importedName, line }]

  for (const f of files) {
    // 1. Declaration pass — only top-level body statements, no recursion.
    //    Nested functions are intentionally not indexed; trace from the outer fn.
    for (const node of f.ast.body || []) {
      const declList = collectDecls(node);
      for (const d of declList) {
        addDef(defs, d.name, { file: f, line: d.line, col: d.col, kind: d.kind, exported: d.exported });
        if (d.kind === 'fn' || d.kind === 'class') {
          if (!fnDefs.has(d.name)) fnDefs.set(d.name, []);
          fnDefs.get(d.name).push({ file: f, node: d.bodyNode || d.node, sourceNode: d.sourceNode || d.node });
        }
      }
    }

    // 2. Body pass — recursive walk for calls / assignments / imports.
    const fnStack = [];
    walkScope(f.ast, {
      enter(node) {
        if (isFnLike(node)) fnStack.push(getFnName(node));

        // Calls
        if (node.type === 'CallExpression') {
          const callerName = fnStack.length ? fnStack[fnStack.length - 1] : '<top>';
          if (node.callee?.type === 'Identifier') {
            calls.push({
              file: f,
              line: node.loc.start.line,
              col: node.loc.start.column,
              callee: node.callee.name,
              enclosingFn: callerName,
              isMethod: false,
            });
          } else if (node.callee?.type === 'MemberExpression' && node.callee.property?.type === 'Identifier') {
            calls.push({
              file: f,
              line: node.loc.start.line,
              col: node.loc.start.column,
              callee: node.callee.property.name,
              enclosingFn: callerName,
              isMethod: true,
            });
          }
        }

        // Assignments + UpdateExpressions to state paths
        if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression') {
          const chain = memberChain(node.left);
          assignments.push({ file: f, line: node.loc.start.line, col: node.loc.start.column, chain, kind: 'assign', source: f.lines[node.loc.start.line - 1] });
        } else if (node.type === 'UpdateExpression' && node.argument?.type === 'MemberExpression') {
          const chain = memberChain(node.argument);
          assignments.push({ file: f, line: node.loc.start.line, col: node.loc.start.column, chain, kind: 'update', source: f.lines[node.loc.start.line - 1] });
        } else if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
          const prop = node.callee.property;
          if (prop?.type === 'Identifier' && MUTATING_METHODS.has(prop.name)) {
            const chain = memberChain(node.callee.object) + '.' + prop.name + '()';
            assignments.push({ file: f, line: node.loc.start.line, col: node.loc.start.column, chain, kind: 'mut-call', source: f.lines[node.loc.start.line - 1] });
          }
        }

        // Imports — record the edges for slice / future use
        if (node.type === 'ImportDeclaration') {
          const list = importEdges.get(f.rel) || [];
          for (const spec of node.specifiers) {
            list.push({
              specifier: node.source.value,
              localName: spec.local.name,
              importedName: spec.imported?.name ?? (spec.type === 'ImportDefaultSpecifier' ? 'default' : '*'),
              line: node.loc.start.line,
            });
          }
          importEdges.set(f.rel, list);
        }
      },
      exit(node) {
        if (isFnLike(node)) fnStack.pop();
      },
    });

    // References pass — separate so we have a clean skip set
    collectRefs(f, refs);
  }

  _index = { files, defs, refs, calls, fnDefs, assignments, importEdges };
  return _index;
}

// --- subcommands ---

function runDefs(name) {
  if (!name) die('ast defs: <name> required');
  const idx = buildIndex();
  const hits = idx.defs.get(name) || [];
  return hits.map(h => formatDef(h, name));
}

function runRefs(name) {
  if (!name) die('ast refs: <name> required');
  const idx = buildIndex();
  const hits = (idx.refs.get(name) || []).filter(r => !isDeclAt(idx, name, r));
  return hits.map(r => formatRef(r, name));
}

function runCalls(name) {
  if (!name) die('ast calls: <name> required');
  const idx = buildIndex();
  const hits = idx.calls.filter(c => c.callee === name);
  return hits.map(c => formatCall(c, name));
}

function runCallees(name) {
  if (!name) die('ast callees: <name> required');
  const idx = buildIndex();
  const fns = idx.fnDefs.get(name);
  if (!fns) return [];
  const out = [];
  for (const fnDef of fns) {
    const node = fnDef.node;
    const callees = [];
    walkScope(node, {
      enter(n) {
        if (n.type === 'CallExpression') {
          if (n.callee?.type === 'Identifier') {
            callees.push({ name: n.callee.name, line: n.loc.start.line, isMethod: false });
          } else if (n.callee?.type === 'MemberExpression' && n.callee.property?.type === 'Identifier') {
            callees.push({ name: n.callee.property.name, line: n.loc.start.line, isMethod: true });
          }
        }
      },
    });
    for (const c of callees) {
      if (asJson) {
        out.push(JSON.stringify({ caller: name, callee: c.name, file: fnDef.file.rel, line: c.line, method: c.isMethod }));
      } else {
        out.push(`${fnDef.file.rel}:${c.line} ${name} -> ${c.name}${c.isMethod ? ' [method]' : ''}`);
      }
    }
  }
  return out;
}

function runTrace(name) {
  if (!name) die('ast trace: <name> required');
  const idx = buildIndex();
  if (!idx.fnDefs.has(name)) {
    process.stderr.write(`ast trace: no function definition for "${name}" in scope\n`);
    return [];
  }
  const out = [];
  const visited = new Set();
  function recurse(fnName, level) {
    if (level > depth) { out.push(prefix(level) + `${fnName} [max-depth]`); return; }
    if (visited.has(fnName)) { out.push(prefix(level) + `${fnName} [cycle]`); return; }
    visited.add(fnName);

    const fns = idx.fnDefs.get(fnName);
    if (!fns) { out.push(prefix(level) + `${fnName} [external]`); visited.delete(fnName); return; }

    const firstDef = fns[0];
    out.push(prefix(level) + `${fnName}  (${firstDef.file.rel}:${firstDef.node.loc.start.line})`);

    const calleeNames = [];
    walkScope(firstDef.node, {
      enter(n) {
        if (n.type === 'CallExpression' && n.callee?.type === 'Identifier') {
          calleeNames.push(n.callee.name);
        }
      },
    });
    const unique = [...new Set(calleeNames)];
    for (const c of unique) recurse(c, level + 1);

    visited.delete(fnName);
  }
  recurse(name, 0);
  return out;

  function prefix(level) { return '  '.repeat(level) + (level > 0 ? '-> ' : ''); }
}

function runPath(fromName, toName) {
  if (!fromName || !toName) die('ast path: <from> <to> required');
  const idx = buildIndex();
  if (!idx.fnDefs.has(fromName)) { process.stderr.write(`ast path: no def for "${fromName}"\n`); return []; }
  const calleesOf = (name) => {
    const fns = idx.fnDefs.get(name);
    if (!fns) return [];
    const set = new Set();
    walkScope(fns[0].node, {
      enter(n) {
        if (n.type === 'CallExpression' && n.callee?.type === 'Identifier') set.add(n.callee.name);
      },
    });
    return [...set];
  };

  const results = [];
  const visited = new Set([fromName]);
  function dfs(node, trail) {
    if (trail.length > depth + 1) return;
    if (node === toName) { results.push([...trail]); return; }
    for (const next of calleesOf(node)) {
      if (visited.has(next)) continue;
      visited.add(next);
      trail.push(next);
      dfs(next, trail);
      trail.pop();
      visited.delete(next);
    }
  }
  dfs(fromName, [fromName]);
  return results.map(p => asJson ? JSON.stringify({ path: p }) : p.join(' -> '));
}

function runWrites(pattern) {
  if (!pattern) die('ast writes: <pattern> required (e.g. state.units.*)');
  const idx = buildIndex();
  const re = compilePattern(pattern);
  const hits = idx.assignments.filter(a => re.test(a.chain));
  return hits.map(h => formatWrite(h));
}

function runSlice(kind, target) {
  if (!kind) die('ast slice: kind required (fn | imports | exports)');
  if (kind === 'fn') {
    if (!target) die('ast slice fn: <name> required');
    const idx = buildIndex();
    const fns = idx.fnDefs.get(target);
    if (!fns) return [];
    return fns.map(f => {
      const src = f.file.source.slice(f.sourceNode.start, f.sourceNode.end);
      return `// ${f.file.rel}:${f.sourceNode.loc.start.line}\n${src}`;
    });
  }
  if (kind === 'imports' || kind === 'exports') {
    if (!target) die(`ast slice ${kind}: <file> required`);
    const abs = resolve(root, target);
    const source = safeRead(abs);
    if (source == null) die(`ast slice ${kind}: cannot read ${target}`);
    const ast = parseJS(source, abs);
    const lines = [];
    for (const node of ast.body || []) {
      const wanted = (kind === 'imports')
        ? node.type === 'ImportDeclaration'
        : (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration' || node.type === 'ExportAllDeclaration');
      if (!wanted) continue;
      const snippet = source.slice(node.start, node.end);
      lines.push(`${rel(abs, root)}:${node.loc.start.line}  ${snippet}`);
    }
    return lines;
  }
  die(`ast slice: unknown kind "${kind}"`);
}

// --- index helpers ---

function collectDecls(node) {
  const out = [];
  // Top-level function/class declarations
  if (node.type === 'FunctionDeclaration' && node.id) {
    out.push({ name: node.id.name, line: node.loc.start.line, col: node.loc.start.column, kind: 'fn', node, sourceNode: node, bodyNode: node });
  } else if (node.type === 'ClassDeclaration' && node.id) {
    out.push({ name: node.id.name, line: node.loc.start.line, col: node.loc.start.column, kind: 'class', node, sourceNode: node, bodyNode: node });
  } else if (node.type === 'VariableDeclaration') {
    for (const d of node.declarations) {
      if (d.id?.type !== 'Identifier') continue;
      const isFn = d.init && (d.init.type === 'FunctionExpression' || d.init.type === 'ArrowFunctionExpression');
      out.push({
        name: d.id.name,
        line: d.loc.start.line,
        col: d.loc.start.column,
        kind: isFn ? 'fn' : node.kind, // const/let/var, or fn
        node: d,
        sourceNode: node, // include `const` keyword in slice
        bodyNode: isFn ? d.init : d,
      });
    }
  } else if (node.type === 'ExportNamedDeclaration') {
    if (node.declaration) {
      const inner = collectDecls(node.declaration);
      for (const i of inner) out.push({ ...i, exported: true, sourceNode: node });
    }
    for (const spec of node.specifiers || []) {
      if (spec.exported?.name) {
        out.push({
          name: spec.exported.name,
          line: spec.loc.start.line,
          col: spec.loc.start.column,
          kind: 'export-spec',
          exported: true,
          node: spec,
          sourceNode: spec,
        });
      }
    }
  } else if (node.type === 'ExportDefaultDeclaration') {
    out.push({
      name: 'default',
      line: node.loc.start.line,
      col: node.loc.start.column,
      kind: 'default',
      exported: true,
      node,
      sourceNode: node,
    });
  }
  return out;
}

function addDef(map, name, entry) {
  if (!map.has(name)) map.set(name, []);
  map.get(name).push(entry);
}

function isFnLike(n) {
  return n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
}

function getFnName(node) {
  if (node.type === 'FunctionDeclaration' && node.id) return node.id.name;
  return '<anon>';
}

function collectRefs(file, refs) {
  // Walk all Identifier nodes, but skip declarations, property keys, and import locals.
  const skip = new WeakSet();
  walkScope(file.ast, {
    enter(n) {
      // Mark identifiers that are declarations / properties — not refs
      if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) skip.add(n.id);
      if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') skip.add(n.id);
      if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') {
        if (n.local) skip.add(n.local);
        if (n.imported) skip.add(n.imported);
      }
      if (n.type === 'ExportSpecifier') {
        if (n.local) skip.add(n.local);
        if (n.exported) skip.add(n.exported);
      }
      if (n.type === 'MemberExpression' && !n.computed && n.property?.type === 'Identifier') {
        skip.add(n.property);
      }
      if (n.type === 'Property' && !n.computed && n.key?.type === 'Identifier' && n.shorthand !== true) {
        skip.add(n.key);
      }
      if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
        for (const p of n.params) if (p.type === 'Identifier') skip.add(p);
      }
    },
  });

  const fnStack = [];
  walkScope(file.ast, {
    enter(n) {
      if (isFnLike(n)) fnStack.push(getFnName(n));
      if (n.type === 'Identifier' && !skip.has(n)) {
        if (!refs.has(n.name)) refs.set(n.name, []);
        refs.get(n.name).push({
          file,
          line: n.loc.start.line,
          col: n.loc.start.column,
          enclosingFn: fnStack.length ? fnStack[fnStack.length - 1] : '<top>',
        });
      }
    },
    exit(n) {
      if (isFnLike(n)) fnStack.pop();
    },
  });
}

function isDeclAt(idx, name, ref) {
  const defs = idx.defs.get(name) || [];
  return defs.some(d => d.file.rel === ref.file.rel && d.line === ref.line && Math.abs(d.col - ref.col) < 80);
}

// --- formatters ---

function formatDef(h, name) {
  if (asJson) return JSON.stringify({ name, path: h.file.rel, line: h.line, col: h.col, kind: h.kind, exported: !!h.exported });
  const tag = h.exported ? ' [exported]' : '';
  return withContext(`${h.file.rel}:${h.line}:${h.col} ${h.kind} ${name}${tag}`, h.file, h.line);
}

function formatRef(r, name) {
  if (asJson) return JSON.stringify({ name, path: r.file.rel, line: r.line, col: r.col, enclosing: r.enclosingFn });
  return withContext(`${r.file.rel}:${r.line}:${r.col} ${r.enclosingFn} -> ${name}`, r.file, r.line);
}

function formatCall(c, name) {
  if (asJson) return JSON.stringify({ path: c.file.rel, line: c.line, col: c.col, callee: name, enclosing: c.enclosingFn, method: c.isMethod });
  const tag = c.isMethod ? ' [method]' : '';
  return withContext(`${c.file.rel}:${c.line}:${c.col} ${c.enclosingFn} -> ${name}${tag}`, c.file, c.line);
}

function formatWrite(w) {
  if (asJson) return JSON.stringify({ path: w.file.rel, line: w.line, col: w.col, chain: w.chain, kind: w.kind });
  return withContext(`${w.file.rel}:${w.line}:${w.col} ${w.kind.padEnd(9)} ${w.chain}`, w.file, w.line);
}

function withContext(header, file, line) {
  if (!contextLines) return header;
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(file.lines.length, line + contextLines);
  const ctx = [];
  for (let i = start; i < end; i++) {
    const marker = (i + 1 === line) ? '>' : ' ';
    ctx.push(`  ${marker} ${i + 1}: ${file.lines[i]}`);
  }
  return [header, ...ctx].join('\n');
}

// --- pattern matching for `writes` ---

function compilePattern(pattern) {
  // Convert glob-ish chain pattern to a regex matching memberChain output.
  // `*` = one segment (no dot). `[?]` (computed access) is preserved as a literal.
  // Examples: state.units.* -> /^state\.units\.[^.]+$/
  //           state.*       -> /^state\.[^.]+$/
  //           state.players.*.* -> /^state\.players\.[^.]+\.[^.]+$/
  let regex = '';
  for (const ch of pattern) {
    if (ch === '*') regex += '[^.]+';
    else if (ch === '.') regex += '\\.';
    else if (/[a-zA-Z0-9_$\[\]?]/.test(ch)) regex += ch;
    else regex += '\\' + ch;
  }
  return new RegExp('^' + regex + '$');
}

const MUTATING_METHODS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
]);

function memberChain(node) {
  if (!node) return '?';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression') {
    const left = memberChain(node.object);
    const right = node.computed ? '[?]' : (node.property?.type === 'Identifier' ? node.property.name : '[?]');
    return left + '.' + right;
  }
  if (node.type === 'CallExpression') return memberChain(node.callee) + '()';
  return '?';
}

// --- walker with enter/exit hooks ---

function walkScope(node, visitors) {
  if (!node || typeof node !== 'object' || !node.type) return;
  visitors.enter?.(node);
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const c of v) walkScope(c, visitors);
    } else if (v && typeof v === 'object' && v.type) {
      walkScope(v, visitors);
    }
  }
  visitors.exit?.(node);
}

const SKIP_KEYS = new Set(['loc', 'range', 'start', 'end', 'parent', 'type']);

// --- misc ---

function safeRead(p) { try { return readFileSync(p, 'utf8'); } catch { return null; } }
function die(msg) { process.stderr.write(`${msg}\n`); process.exit(2); }

// --- entrypoint ---

main();

function main() {
  const t0 = Date.now();
  let out;
  switch (subcommand) {
    case 'defs':     out = runDefs(args._[1]); break;
    case 'refs':     out = runRefs(args._[1]); break;
    case 'calls':    out = runCalls(args._[1]); break;
    case 'callees':  out = runCallees(args._[1]); break;
    case 'trace':    out = runTrace(args._[1]); break;
    case 'path':     out = runPath(args._[1], args._[2]); break;
    case 'writes':   out = runWrites(args._[1]); break;
    case 'slice':    out = runSlice(args._[1], args._[2]); break;
    default:
      process.stderr.write(`ast: unknown subcommand "${subcommand}"\n`);
      process.exit(2);
  }
  process.stdout.write(out.join('\n') + (out.length ? '\n' : ''));
  if (!quiet) {
    process.stderr.write(`# ast ${subcommand}: ${out.length} result(s) (${Date.now() - t0} ms)\n`);
  }
}
