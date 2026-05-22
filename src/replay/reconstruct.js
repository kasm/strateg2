// Headless replay reconstruction.
//
// Re-runs a recorded match by feeding its command stream back into a fresh,
// deterministic sim. The simulation has no randomness, so replaying the same
// ordered commands from the same spawnInitial() seed reproduces every tick
// exactly — which is also how the replay is verified (checksum compare).
//
// This is a pure utility: no DOM, no canvas, no playback UI. It powers the
// determinism test and the AI-analysis exporter (.claude/scripts/replay.mjs).

import { CONFIG } from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { stateChecksum } from './checksum.js';

/**
 * @typedef {Object} ReconstructResult
 * @property {import('../core/world.js').SimWorld} world  - the world at its final tick
 * @property {import('../core/game-state.js').GameState} state
 * @property {string} checksum   - digest of the reconstructed final state
 * @property {boolean} verified  - checksum matches the one stored in the replay
 */

/**
 * Reconstruct a match from a replay object.
 * @param {Object} replay  - parsed replay JSON (see docs/replay-format.md)
 * @param {{ onTick?: (tick:number, state:import('../core/game-state.js').GameState) => void }} [opts]
 * @returns {ReconstructResult}
 */
export function reconstructReplay(replay, { onTick } = {}) {
  if (!replay || replay.format !== 'strateg2-replay') {
    throw new Error('not a strateg2 replay');
  }

  const world = createSimWorld(CONFIG);
  spawnInitial(world);

  // Restore the sim-affecting setup captured at tick 0.
  world.state.alwaysHit = replay.setup.alwaysHit;
  world.state.supplyPriority = replay.setup.supplyPriority;
  // The recorded command log is the SOLE input. Leaving AI on would generate
  // fresh, duplicate commands and diverge — the log already contains every
  // command the AI produced during the original match.
  world.state.aiType.red = 'off';
  world.state.aiType.blue = 'off';

  // Bucket commands by the tick they were drained at.
  const byTick = new Map();
  for (const c of replay.commands) {
    if (!byTick.has(c.tick)) byTick.set(c.tick, []);
    byTick.get(c.tick).push(c);
  }

  const finalTick = replay.result.finalTick;
  onTick?.(world.state.tick, world.state);

  // A command stamped tick:T is drained when state.tick === T, at the start of
  // the tick() that advances T -> T+1. So submit T's commands, then step.
  let guard = finalTick + 8; // hard stop against a malformed replay
  while (world.state.tick < finalTick && !world.state.gameOver && guard-- > 0) {
    const T = world.state.tick;
    const due = byTick.get(T);
    if (due) for (const c of due) submitCommand(world, { ...c });
    stepTick(world, TICK_DT);
    onTick?.(world.state.tick, world.state);
  }

  const checksum = stateChecksum(world.state);
  return { world, state: world.state, checksum, verified: checksum === replay.checksum };
}
