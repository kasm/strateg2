#!/usr/bin/env node
// P11 — Faction access via API, not string equality.
//
// The codebase historically modeled sides as bare string literals ('red',
// 'blue', 'neutral'). That worked for a 2-player game; it falls over the
// moment a third faction (`wild` for PvE, eventual co-op allies, etc.)
// enters the picture. `src/core/factions.js` is the API for new code.
//
// Rule: BinaryExpression with `===` / `!==` / `==` / `!=` where one operand
// is a string literal matching a faction id is a violation — except in
// files whitelisted below (legacy 2-player code that's intentionally not
// migrated, plus the registry itself and the renderer where colour lookup
// happens per-string).
//
// This script does not police array iteration like `for (const side of
// ['red', 'blue'])` — those are caught at code review; converting them is
// a separate refactor.
//
// Usage: node .claude/scripts/check-faction-access.mjs
// Exits 0 on no violations, 1 on violations, 2 on parse error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd().replace(/\\/g, '/');
const SRC = join(ROOT, 'src').replace(/\\/g, '/');

const FACTION_LITERALS = new Set(['red', 'blue', 'neutral', 'wild']);
const EQUALITY_OPS = new Set(['===', '!==', '==', '!=']);

// Legacy files allowed to keep their string-equality faction checks.
// Each entry should have a one-line reason. Migrating any of these is a
// follow-up — the seam exists *now* for new code, not by retroactive sweep.
const WHITELIST = new Set([
  // The registry itself describes factions by literal id — exempt by definition.
  'src/core/factions.js',
  // AI deciders encode 2-player adversarial logic (`enemy = owner === 'red' ? 'blue' : 'red'`).
  // Generalizing this is a separate, larger refactor; bandits drive themselves via the pve
  // module and never go through these deciders.
  'src/modules/ai/assess.internal.js',
  'src/modules/ai/decision-att.internal.js',
  'src/modules/ai/decision-def.internal.js',
  'src/modules/ai/tactics.internal.js',
  // Combat projectile guard uses literal 'neutral' as a friendly-fire opt-out.
  // Wild is naturally hostile to red/blue, so existing logic produces the right
  // result without migration; revisit if neutral semantics change.
  'src/modules/combat/projectiles.internal.js',
  // Render colour lookup keyed off literal owner — moving this to the registry
  // is purely cosmetic and adds an indirection where directness reads better.
  'src/modules/render/sprites.js',
  'src/modules/render/minimap.js',
  // Replay digest encodes the gameOver winner as 0/1/2. The fold order is part
  // of the on-disk checksum format; changing it invalidates every recorded match.
  'src/replay/checksum.js',
  // Server tracks the leaver's slot to award the win to the other side. 2-player
  // lobby is hardcoded at the transport layer; PvE doesn't change that contract.
  'src/server/index.js',
  // Client decides "did I win?" against the lobby slot it was assigned. Same
  // 2-player lobby contract as the server.
  'src/client/game-controller.js',
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

function isFactionLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' && FACTION_LITERALS.has(node.value);
}

const violations = [];

for (const file of walkFiles(SRC)) {
  const rel = relPath(file);
  if (WHITELIST.has(rel)) continue;

  let source;
  let ast;
  try {
    source = readFileSync(file, 'utf8');
    ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (e) {
    console.error(`[check-faction-access] parse error in ${rel}: ${e.message}`);
    process.exit(2);
  }

  walk(ast, (node) => {
    if (node.type !== 'BinaryExpression') return;
    if (!EQUALITY_OPS.has(node.operator)) return;
    const lhs = node.left;
    const rhs = node.right;
    const literal = isFactionLiteral(lhs) ? lhs : (isFactionLiteral(rhs) ? rhs : null);
    if (!literal) return;
    const other = literal === lhs ? rhs : lhs;
    violations.push({
      file: rel,
      line: node.loc.start.line,
      detail: `${memberChainString(other)} ${node.operator} '${literal.value}'`,
    });
  });
}

if (violations.length === 0) {
  console.log(`[check-faction-access] OK — no string-equality faction checks outside whitelist.`);
  process.exit(0);
}

console.error('[check-faction-access] VIOLATIONS:\n');
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.detail}`);
}
console.error(`\nTotal: ${violations.length} violation(s)`);
console.error(`\nUse the faction registry instead:`);
console.error(`  import { isPlayer, isHostileBetween, participatesInVictory } from '../core/factions.js';`);
console.error(`If the file genuinely needs to keep the literal compare (legacy 2-player path),`);
console.error(`add it to the WHITELIST in this script with a one-line justification.`);
process.exit(1);
