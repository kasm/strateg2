// PUBLIC API of the simulation. Sim-pure: no DOM, no canvas, no rendering.
// Client bootstrap (browser) and a future Node server bootstrap both call into this.
//
// Behaviour contract:
//   - createSimWorld(config) builds the headless world with empty state.
//   - submitCommand(world, cmd) enqueues a command for the next tick. The dispatcher
//     fills in seq/tick if absent and applies in deterministic (playerId, seq) order.
//   - stepTick(world, dt) advances one fixed-timestep tick: drain commands -> AI ->
//     unit updates -> combat -> projectile -> building production -> prune -> victory.
//   - spawnInitial(world) seeds the standard match (gold mines, town halls, peasants).

import { createWorld } from '../core/world.js';
import { tick, TICK_DT } from '../core/game-loop.js';

export { TICK_DT };

/** @param {import('../core/config.js').GameConfig} config */
export function createSimWorld(config) {
  return createWorld(config);
}

/** @param {import('../core/world.js').SimWorld} world */
export function spawnInitial(world) {
  world.entities.spawnInitial();
  world.ai.resetAI();
  // Start a fresh replay recording — captures setup (alwaysHit, supplyPriority,
  // aiType) as it stands at tick 0, then logs every command from here.
  world.recorder.begin(world.state);
}

/**
 * @param {import('../core/world.js').SimWorld} world
 * @param {import('../commands/index.js').Command} cmd
 */
export function submitCommand(world, cmd) {
  world.commands.submit(cmd);
}

/**
 * @param {import('../core/world.js').SimWorld} world
 * @param {number} dt
 */
export function stepTick(world, dt) {
  tick(world, dt);
}
