// Pure tool handlers for the analyzers MCP server.
//
// Each handler spawns the corresponding read-only analyzer script under
// .claude/scripts/ and returns its stdout markdown verbatim. The MCP server
// is a faithful CLI->tool wrapper; the contract test asserts byte-for-byte
// equivalence with direct CLI invocation.
//
// HARD INVARIANT — read-only by construction:
//   No handler in this file writes to disk. No handler shells out to anything
//   other than `node .claude/scripts/<script>.mjs`. Args are validated as
//   strict path/identifier whitelists to prevent script injection.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');

const TARGET_RE  = /^[A-Za-z0-9_./-]+$/;
const SYMBOL_RE  = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateTarget(target) {
  if (target == null || target === '') return null;
  if (typeof target !== 'string') throw new Error('target must be a string');
  if (target.includes('..')) throw new Error('target must not contain ".."');
  if (target.startsWith('/') || /^[A-Za-z]:/.test(target)) {
    throw new Error('target must be repo-relative');
  }
  if (!TARGET_RE.test(target)) throw new Error('target contains forbidden characters');
  return target;
}

function validateSymbol(name) {
  if (typeof name !== 'string') throw new Error('name must be a string');
  if (!SYMBOL_RE.test(name)) throw new Error('name must be a JS identifier');
  return name;
}

function runScript(scriptRel, extraArgs = []) {
  const r = spawnSync(
    process.execPath,
    [resolve(ROOT, scriptRel), ...extraArgs],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(`script ${scriptRel} exited with status ${r.status}: ${(r.stderr || '').trim()}`);
  }
  return r.stdout;
}

function targetTool(scriptRel) {
  return async ({ target } = {}) => {
    const t = validateTarget(target);
    const args = t ? [t] : [];
    return { markdown: runScript(scriptRel, args) };
  };
}

export const HANDLERS = {
  'analyze.structure':   targetTool('.claude/scripts/structure.mjs'),
  'analyze.graph':       targetTool('.claude/scripts/graph.mjs'),
  'analyze.symbols':     targetTool('.claude/scripts/symbols.mjs'),
  'analyze.routes':      targetTool('.claude/scripts/routes.mjs'),
  'analyze.complexity':  targetTool('.claude/scripts/complexity.mjs'),
  'analyze.todos':       targetTool('.claude/scripts/todos.mjs'),
  'analyze.gitActivity': targetTool('.claude/scripts/git-activity.mjs'),
  'analyze.context':     targetTool('.claude/scripts/context.mjs'),

  'analyze.refs': async ({ name, target } = {}) => {
    const n = validateSymbol(name);
    const t = validateTarget(target);
    const args = t ? [n, t] : [n];
    return { markdown: runScript('.claude/scripts/refs.mjs', args) };
  },

  'analyze.deps': async () => ({
    markdown: runScript('.claude/scripts/deps.mjs', []),
  }),
};

export const TOOL_SPECS = [
  { name: 'analyze.structure',   description: 'Directory tree, file counts, JS LOC, detected entry points.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.graph',       description: 'File-to-file import graph (ESM + CJS), cycles, hubs, orphans.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.symbols',     description: 'Exported symbols per file.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.refs',        description: 'References to a symbol by name (regex).', inputSchema: { type: 'object', properties: { name: { type: 'string' }, target: { type: 'string' } }, required: ['name'] } },
  { name: 'analyze.routes',      description: 'HTTP routes + socket.io events.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.complexity',  description: 'LOC, function/class count, max nesting depth, longest function per file.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.deps',        description: 'npm dependency usage report (unused/missing flags).', inputSchema: { type: 'object', properties: {} } },
  { name: 'analyze.todos',       description: 'TODO/FIXME/HACK/XXX/NOTE markers.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.gitActivity', description: 'Recent commits, hot files, directory churn, authors.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
  { name: 'analyze.context',     description: 'Aggregator — runs the relevant subset and writes a markdown bundle.', inputSchema: { type: 'object', properties: { target: { type: 'string' } } } },
];
