#!/usr/bin/env node
// replay.mjs — expand a saved replay into an LLM-friendly match report.
//
// Usage:
//   node .claude/scripts/replay.mjs <replay.json> [--every <ticks>]
//
// Reconstructs the match deterministically from the recorded command stream
// (src/replay/reconstruct.js) and prints, to stdout:
//   - match header + determinism verification
//   - a command-type summary
//   - a semantic event timeline (builds / training / settings)
//   - periodic keyframe snapshots (resources, army composition)
//
// Unlike the other analyzers in this directory it runs the simulation rather
// than walking source files, but it follows the same contract: pure read,
// markdown to stdout.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconstructReplay } from '../../src/replay/reconstruct.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const everyArg = args.indexOf('--every');
const EVERY = everyArg >= 0 ? Math.max(1, parseInt(args[everyArg + 1], 10) || 0) : 300;

if (!file) {
  console.error('usage: node .claude/scripts/replay.mjs <replay.json> [--every <ticks>]');
  process.exit(1);
}

const replay = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (replay.format !== 'strateg2-replay') {
  console.error(`not a strateg2 replay: ${file}`);
  process.exit(1);
}

const rate = replay.engine?.tickRate || 30;
const mmss = (tick) => {
  const s = Math.floor(tick / rate);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// --- Reconstruct, collecting keyframes -------------------------------------

const keyframes = [];
function snapshot(tick, state) {
  const count = (type, owner, kind) => state.entities.filter(
    e => e.type === type && e.owner === owner && (!kind || e.kind === kind),
  ).length;
  keyframes.push({
    tick,
    red:  { gold: Math.floor(state.players.red.gold),  wood: Math.floor(state.players.red.wood) },
    blue: { gold: Math.floor(state.players.blue.gold), wood: Math.floor(state.players.blue.wood) },
    units: {
      red:  { peasant: count('unit', 'red', 'peasant'),  swordsman: count('unit', 'red', 'swordsman'),  archer: count('unit', 'red', 'archer') },
      blue: { peasant: count('unit', 'blue', 'peasant'), swordsman: count('unit', 'blue', 'swordsman'), archer: count('unit', 'blue', 'archer') },
    },
    buildings: { red: count('building', 'red'), blue: count('building', 'blue') },
  });
}

const recon = reconstructReplay(replay, {
  onTick: (tick, state) => {
    if (tick % EVERY === 0 || tick === replay.result.finalTick) snapshot(tick, state);
  },
});

// --- Report ----------------------------------------------------------------

const out = [];
out.push(`# Replay analysis — ${file}`);
out.push('');
out.push(`- Recorded: ${replay.recordedAt || 'unknown'}`);
out.push(`- Length: ${replay.result.finalTick} ticks (${mmss(replay.result.finalTick)} at ${rate} tps)`);
out.push(`- Winner: **${replay.result.winner || 'unfinished'}**`);
out.push(`- AI: red=${replay.setup.aiType.red}, blue=${replay.setup.aiType.blue}`);
out.push(`- Setup: alwaysHit=${replay.setup.alwaysHit}, supplyPriority=${replay.setup.supplyPriority}`);
out.push(`- Determinism check: ${recon.verified ? 'PASS — replay reconstructs exactly' : 'FAIL — checksum mismatch'}`);
out.push('');

// Command summary
const byType = {};
for (const c of replay.commands) byType[c.type] = (byType[c.type] || 0) + 1;
out.push('## Commands');
out.push('');
out.push(`Total: ${replay.commands.length}`);
out.push('');
out.push('| type | count |');
out.push('|---|---|');
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  out.push(`| ${t} | ${n} |`);
}
out.push('');

// Event timeline — builds, training, settings (orders are omitted as noise).
out.push('## Event timeline');
out.push('');
const describe = (c) => {
  if (c.type === 'build')     return `${c.playerId} builds ${c.kind} at (${c.tileX},${c.tileY})`;
  if (c.type === 'train')     return `${c.playerId} trains ${c.unitKind} (building #${c.buildingId})`;
  if (c.type === 'eject')     return `${c.playerId} ejects tower #${c.buildingId}`;
  if (c.type === 'setOption') return `${c.playerId} sets ${c.key} = ${c.value}`;
  return null;
};
const events = replay.commands
  .map(c => ({ tick: c.tick, text: describe(c) }))
  .filter(e => e.text);
if (events.length === 0) {
  out.push('_(no build/train/setting events)_');
} else {
  for (const e of events) out.push(`- \`${mmss(e.tick)}\` (t${e.tick}) — ${e.text}`);
}
out.push('');

// Keyframes
out.push('## Keyframes');
out.push('');
out.push('| time | tick | R gold/wood | B gold/wood | R units (P/S/A) | B units (P/S/A) | R/B buildings |');
out.push('|---|---|---|---|---|---|---|');
for (const k of keyframes) {
  const u = (s) => `${s.peasant}/${s.swordsman}/${s.archer}`;
  out.push(
    `| ${mmss(k.tick)} | ${k.tick} | ${k.red.gold}/${k.red.wood} | ${k.blue.gold}/${k.blue.wood} ` +
    `| ${u(k.units.red)} | ${u(k.units.blue)} | ${k.buildings.red}/${k.buildings.blue} |`,
  );
}
out.push('');

console.log(out.join('\n'));
