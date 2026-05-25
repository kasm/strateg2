// Step-by-step replay playback.
//
// Like reconstruct.js, but exposes the loop one tick at a time so a RAF-driven
// viewer can render between steps. The sim is forward-only, so this module is
// too: seekForward advances silently, and backward seek is a caller concern
// (discard the playback, build a new one, seekForward to the target).
//
// Invariant: during playback the recorded command log is the SOLE source of
// state mutation. AI is forced off; the host (the controller) must NOT wire
// input that submits commands, nor a network transport.

import { CONFIG } from '../core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../sim/index.js';
import { stateChecksum } from './checksum.js';

/**
 * @typedef {Object} Playback
 * @property {import('../core/game-state.js').GameState} state
 * @property {Object} map
 * @property {Object} entities
 * @property {import('../core/config.js').GameConfig} config
 * @property {number} finalTick
 * @property {() => number} getTick
 * @property {() => boolean} step          - advance one tick; false if already at finalTick/gameOver
 * @property {(target:number) => void} seekForward
 * @property {() => boolean} verifyChecksum
 */

/**
 * Build a forward-only playback driver for a recorded replay.
 * @param {Object} replay - parsed replay JSON (see docs/replay-format.md)
 * @returns {Playback}
 */
export function createPlayback(replay) {
  if (!replay || replay.format !== 'strateg2-replay') {
    throw new Error('not a strateg2 replay');
  }

  const opts = (replay.setup && replay.setup.mapW && replay.setup.mapH)
    ? { mapW: replay.setup.mapW, mapH: replay.setup.mapH }
    : undefined;
  const world = createSimWorld(CONFIG, opts);
  spawnInitial(world);

  world.state.alwaysHit = replay.setup.alwaysHit;
  world.state.supplyPriority = replay.setup.supplyPriority;
  // AI off: the recorded command stream already contains every command the AI
  // produced during the original match; rerunning the AI would double-issue.
  world.state.aiType.red = 'off';
  world.state.aiType.blue = 'off';

  const byTick = new Map();
  for (const c of replay.commands) {
    if (!byTick.has(c.tick)) byTick.set(c.tick, []);
    byTick.get(c.tick).push(c);
  }

  const finalTick = replay.result.finalTick;

  function step() {
    if (world.state.gameOver) return false;
    if (world.state.tick >= finalTick) return false;
    const T = world.state.tick;
    const due = byTick.get(T);
    // Clone so a later mutation of the queued cmd object can't rewrite history
    // (the recorder did the same on the way in).
    if (due) for (const c of due) submitCommand(world, { ...c });
    stepTick(world, TICK_DT);
    return true;
  }

  function seekForward(target) {
    if (target < world.state.tick) {
      throw new Error(`seekForward: target ${target} < current ${world.state.tick}; playback is forward-only`);
    }
    if (target > finalTick) {
      throw new Error(`seekForward: target ${target} > finalTick ${finalTick}`);
    }
    // Hard guard against a malformed replay where commands never advance to finalTick.
    let guard = (target - world.state.tick) + 8;
    while (world.state.tick < target && !world.state.gameOver && guard-- > 0) {
      step();
    }
  }

  function verifyChecksum() {
    return stateChecksum(world.state) === replay.checksum;
  }

  return {
    state:    world.state,
    map:      world.map,
    entities: world.entities,
    config:   world.config,
    finalTick,
    getTick:        () => world.state.tick,
    step,
    seekForward,
    verifyChecksum,
  };
}
