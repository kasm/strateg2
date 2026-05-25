#!/usr/bin/env node
// P7 — Single-Writer Rule check.
//
// Sim state (the top-level fields of GameState in src/core/game-state.js) may be
// mutated ONLY from files under ALLOWED_PREFIXES. Every other file is read-only.
//
// Scope of detection:
//   - AssignmentExpression / UpdateExpression whose LHS chain matches `state.<simField>`
//     (anywhere along the chain), e.g. `state.tick = 0`, `world.state.gameOver = 'red'`,
//     `state.players.red.gold += 5`.
//   - CallExpression whose callee is a mutating method (push/pop/shift/unshift/splice/sort/
//     reverse/fill/copyWithin) on an object chain that matches the same pattern, e.g.
//     `state.entities.push(u)`, `world.state.projectiles.splice(i, 1)`.
//
// Out of scope (known holes — caught by code review + future P7 phase):
//   - Mutations through resolved entity refs (`u.hp = 0` after `const u = entities.byId(id)`).
//   - Computed access like `state[fieldName]`.
//   - `const s = state; s.X = Y` aliasing.
//
// SIM_FIELDS comes from src/core/game-state.js. Keep in sync if a field is added.
//
// Usage: node .claude/scripts/check-single-writer.mjs
// Exits 0 on no violations, 1 on violations, 2 on parse error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd().replace(/\\/g, '/');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

// Files in these prefixes are the canonical sim-state writers. Each entry must be
// justified — adding a prefix without explaining why defeats the rule.
const ALLOWED_PREFIXES = [
  'src/commands/',          // dispatcher's apply() functions are the canonical mutation path
  'src/core/',              // game-loop (advanceTick/victoryCheck), game-state (factory/reset),
                            //   economy/research (called transitively from commands & spawnInitial)
  'src/modules/combat/',    // projectiles + buildings phases legitimately mutate sim state
  'src/modules/entities/',  // entity factory + pruneDead — canonical owner of state.entities
  'src/modules/units/',     // unitsUpdate phase mutates unit positions/jobs/hp on state.entities
  'src/modules/pve/',       // pveUpdate phase: spawns wild creatures, drives wave timers, emits events
  'src/replay/',            // replay reconstruction restores state from a save — equivalent to
                            //   spawnInitial in entities/index.js
];

// Sim-state top-level fields under the single-writer rule.
// Source: src/core/game-state.js typedef GameState.
//
// Deliberately excluded:
//   - `aiType` — per src/commands/set-option.js:14, aiType is intentionally NOT
//     command-routed. Replays start with both sides 'off' and the recorded log
//     already contains every command the AI ever produced; aiType is therefore
//     not a determinism concern. Bootstrap/server lock it 'off' for MP at setup,
//     and the SP options dropdown toggles it during play.
const SIM_FIELDS = [
  'tick', 'entities', 'entitiesById', 'projectiles', 'players',
  'gameOver', 'alwaysHit', 'supplyPriority', '_nextId',
  'events',   // append-only notification log; mutators in core/events.js + emitters in core/, modules/pve/, modules/entities/
  'pve',      // wave-director timers; mutators only in modules/pve/
];

const SIM_FIELD_RE = new RegExp(`(^|\\.)state\\.(${SIM_FIELDS.join('|')})(\\.|$)`);

const MUTATING_METHODS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
]);

function memberChainString(node) {
  if (!node) return '?';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression') {
    const left = memberChainString(node.object);
    const right = node.computed ? '[?]' : (node.property?.type === 'Identifier' ? node.property.name : '[?]');
    return left + '.' + right;
  }
  if (node.type === 'CallExpression') return memberChainString(node.callee) + '()';
  return '?';
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
    walk(node[key], visit);
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry).replace(/\\/g, '/');
    const st = statSync(full);
    if (st.isDirectory()) { yield* walkFiles(full); }
    else if (full.endsWith('.js') || full.endsWith('.mjs')) { yield full; }
  }
}

function relPath(absPath) {
  return absPath.replace(ROOT + '/', '');
}

const violations = [];

for (const file of walkFiles(SRC)) {
  const rel = relPath(file);
  if (ALLOWED_PREFIXES.some(p => rel.startsWith(p))) continue;

  let source;
  let ast;
  try {
    source = readFileSync(file, 'utf8');
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.error(`[check-single-writer] parse error in ${rel}: ${e.message}`);
    process.exit(2);
  }

  walk(ast, (node) => {
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression') {
      const chain = memberChainString(node.left);
      if (SIM_FIELD_RE.test(chain)) {
        violations.push({ file: rel, line: node.loc.start.line, chain, kind: 'assignment' });
      }
    } else if (node.type === 'UpdateExpression' && node.argument?.type === 'MemberExpression') {
      const chain = memberChainString(node.argument);
      if (SIM_FIELD_RE.test(chain)) {
        violations.push({ file: rel, line: node.loc.start.line, chain, kind: 'update' });
      }
    } else if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression') {
      const prop = node.callee.property;
      if (prop?.type === 'Identifier' && MUTATING_METHODS.has(prop.name)) {
        const objChain = memberChainString(node.callee.object);
        if (SIM_FIELD_RE.test(objChain)) {
          violations.push({ file: rel, line: node.loc.start.line, chain: `${objChain}.${prop.name}()`, kind: 'mutation-call' });
        }
      }
    }
  });
}

if (violations.length === 0) {
  console.log(`[check-single-writer] OK — no sim-state writes outside the allowlist.`);
  console.log(`  Allowed prefixes: ${ALLOWED_PREFIXES.length}, sim fields watched: ${SIM_FIELDS.length}`);
  process.exit(0);
}

console.error('[check-single-writer] VIOLATIONS:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.kind.padEnd(15)} ${v.chain}`);
}
console.error(`\nTotal: ${violations.length} violation(s)`);
console.error(`\nSee plan: P7 Single-Writer Rule.`);
console.error(`Fix options:`);
console.error(`  1. Move the mutation into a command apply() under src/commands/`);
console.error(`  2. Move it into a tick-phase function (under one of the allowed module roots)`);
console.error(`  3. Add the file's prefix to ALLOWED_PREFIXES with a justification comment`);
process.exit(1);
