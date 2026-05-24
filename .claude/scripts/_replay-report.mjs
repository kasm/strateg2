// Shared report builder for replay analysis.
//
// Used by:
//   - .claude/scripts/replay.mjs           (CLI)
//   - .claude/mcp/replay/handlers.mjs      (MCP tool `replay.analyze`)
//
// Underscore prefix matches the `_shared.mjs` convention from
// .claude/scripts/README.md — do not invoke as a CLI.

import { reconstructReplay } from '../../src/replay/reconstruct.js';
import { stateChecksum } from '../../src/replay/checksum.js';

function mmss(tick, rate) {
  const s = Math.floor(tick / rate);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function snapshot(state) {
  const count = (type, owner, kind) => state.entities.filter(
    (e) => e.type === type && e.owner === owner && (!kind || e.kind === kind),
  ).length;
  return {
    tick: state.tick,
    red:  { gold: Math.floor(state.players.red.gold),  wood: Math.floor(state.players.red.wood) },
    blue: { gold: Math.floor(state.players.blue.gold), wood: Math.floor(state.players.blue.wood) },
    units: {
      red:  { peasant: count('unit', 'red', 'peasant'),  swordsman: count('unit', 'red', 'swordsman'),  archer: count('unit', 'red', 'archer') },
      blue: { peasant: count('unit', 'blue', 'peasant'), swordsman: count('unit', 'blue', 'swordsman'), archer: count('unit', 'blue', 'archer') },
    },
    buildings: { red: count('building', 'red'), blue: count('building', 'blue') },
  };
}

/**
 * Build the markdown analysis report for a parsed replay object.
 * @param {Object} replay      parsed strateg2 replay JSON
 * @param {Object} opts
 * @param {string} opts.label  file path or other label shown in the heading
 * @param {number} [opts.every=300]  keyframe interval (ticks)
 * @returns {string}  markdown report
 */
export function buildReport(replay, { label, every = 300 } = {}) {
  if (!replay || replay.format !== 'strateg2-replay') {
    throw new Error('not a strateg2 replay');
  }
  const rate = replay.engine?.tickRate || 30;
  const EVERY = Math.max(1, every | 0);

  const keyframes = [];
  const recon = reconstructReplay(replay, {
    onTick: (tick, state) => {
      if (tick % EVERY === 0 || tick === replay.result.finalTick) {
        keyframes.push(snapshot(state));
      }
    },
  });

  const out = [];
  out.push(`# Replay analysis — ${label || '(replay)'}`);
  out.push('');
  out.push(`- Recorded: ${replay.recordedAt || 'unknown'}`);
  out.push(`- Length: ${replay.result.finalTick} ticks (${mmss(replay.result.finalTick, rate)} at ${rate} tps)`);
  out.push(`- Winner: **${replay.result.winner || 'unfinished'}**`);
  out.push(`- AI: red=${replay.setup.aiType.red}, blue=${replay.setup.aiType.blue}`);
  out.push(`- Setup: alwaysHit=${replay.setup.alwaysHit}, supplyPriority=${replay.setup.supplyPriority}`);
  out.push(`- Determinism check: ${recon.verified ? 'PASS — replay reconstructs exactly' : 'FAIL — checksum mismatch'}`);
  out.push('');

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
    .map((c) => ({ tick: c.tick, text: describe(c) }))
    .filter((e) => e.text);
  if (events.length === 0) {
    out.push('_(no build/train/setting events)_');
  } else {
    for (const e of events) out.push(`- \`${mmss(e.tick, rate)}\` (t${e.tick}) — ${e.text}`);
  }
  out.push('');

  out.push('## Keyframes');
  out.push('');
  out.push('| time | tick | R gold/wood | B gold/wood | R units (P/S/A) | B units (P/S/A) | R/B buildings |');
  out.push('|---|---|---|---|---|---|---|');
  for (const k of keyframes) {
    const u = (s) => `${s.peasant}/${s.swordsman}/${s.archer}`;
    out.push(
      `| ${mmss(k.tick, rate)} | ${k.tick} | ${k.red.gold}/${k.red.wood} | ${k.blue.gold}/${k.blue.wood} ` +
      `| ${u(k.units.red)} | ${u(k.units.blue)} | ${k.buildings.red}/${k.buildings.blue} |`,
    );
  }
  out.push('');

  return out.join('\n');
}

/**
 * Verify a replay reconstructs exactly. Pure metadata; no markdown output.
 * @returns {{verified:boolean, finalTick:number, winner:string|null, checksum:string}}
 */
export function verifyReplay(replay) {
  if (!replay || replay.format !== 'strateg2-replay') {
    throw new Error('not a strateg2 replay');
  }
  const r = reconstructReplay(replay);
  return {
    verified: r.verified,
    finalTick: replay.result.finalTick,
    winner: replay.result.winner || null,
    checksum: r.checksum,
  };
}

/**
 * Tick-by-tick diff between two replays. Reports the first divergence in both
 * the command stream and the state-checksum trail.
 *
 * @returns {{
 *   identical: boolean,
 *   finalTickA: number, finalTickB: number,
 *   winnerA: string|null, winnerB: string|null,
 *   firstChecksumDivergenceTick: number|null,
 *   firstCommandDivergenceTick: number|null,
 *   commandsByTickDiff: Array<{tick:number, onlyInA:Array, onlyInB:Array}>,
 * }}
 */
export function diffReplays(replayA, replayB) {
  if (!replayA || replayA.format !== 'strateg2-replay') throw new Error('a: not a strateg2 replay');
  if (!replayB || replayB.format !== 'strateg2-replay') throw new Error('b: not a strateg2 replay');

  // Command-stream diff: group both by tick, walk, capture first 20 divergent ticks.
  const groupByTick = (replay) => {
    const m = new Map();
    for (const c of replay.commands) {
      const key = c.tick;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(c);
    }
    return m;
  };
  const a = groupByTick(replayA);
  const b = groupByTick(replayB);
  const allTicks = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);

  const cmdSig = (c) => JSON.stringify({ ...c, seq: undefined, tick: undefined });
  let firstCommandDivergenceTick = null;
  const commandsByTickDiff = [];
  for (const tick of allTicks) {
    const sa = new Map((a.get(tick) || []).map((c) => [cmdSig(c), c]));
    const sb = new Map((b.get(tick) || []).map((c) => [cmdSig(c), c]));
    const onlyInA = [...sa.keys()].filter((k) => !sb.has(k)).map((k) => sa.get(k));
    const onlyInB = [...sb.keys()].filter((k) => !sa.has(k)).map((k) => sb.get(k));
    if (onlyInA.length || onlyInB.length) {
      if (firstCommandDivergenceTick == null) firstCommandDivergenceTick = tick;
      if (commandsByTickDiff.length < 20) {
        commandsByTickDiff.push({ tick, onlyInA, onlyInB });
      }
    }
  }

  // State-checksum diff. Reconstruct both replays collecting per-tick
  // checksums, then find the first index where they differ.
  const csA = [];
  const csB = [];
  reconstructReplay(replayA, { onTick: (_tick, state) => csA.push(stateChecksum(state)) });
  reconstructReplay(replayB, { onTick: (_tick, state) => csB.push(stateChecksum(state)) });

  let firstChecksumDivergenceTick = null;
  const n = Math.min(csA.length, csB.length);
  for (let i = 0; i < n; i++) {
    if (csA[i] !== csB[i]) { firstChecksumDivergenceTick = i; break; }
  }
  // If they matched for the entire common prefix but the lengths differ,
  // divergence is at the shorter length (one replay continued past the other).
  if (firstChecksumDivergenceTick == null && csA.length !== csB.length) {
    firstChecksumDivergenceTick = n;
  }

  return {
    identical: firstCommandDivergenceTick == null && firstChecksumDivergenceTick == null,
    finalTickA: replayA.result.finalTick,
    finalTickB: replayB.result.finalTick,
    winnerA: replayA.result.winner || null,
    winnerB: replayB.result.winner || null,
    firstChecksumDivergenceTick,
    firstCommandDivergenceTick,
    commandsByTickDiff,
  };
}
