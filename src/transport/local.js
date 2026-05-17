// LocalTransport: single-player adapter. submit() delivers the command directly to
// the in-process sim's dispatcher; renderer reads the world state directly so no
// snapshot callbacks are needed.
//
// Same shape as the future NetTransport — the client never branches on mode beyond
// which transport it instantiates.

import { submitCommand } from '../sim/index.js';

/**
 * @typedef {Object} Transport
 * @property {(cmd:import('../commands/index.js').Command) => void} submit
 * @property {(cb:(snapshot:Object) => void) => void} onSnapshot
 * @property {(cb:(commands:Object[]) => void) => void} onCommandsForTick
 */

/**
 * @param {import('../core/world.js').SimWorld} sim
 * @returns {Transport}
 */
export function createLocalTransport(sim) {
  return {
    submit(cmd) { submitCommand(sim, cmd); },
    // No-ops for local: there is no remote sim, no snapshots travel across a boundary.
    onSnapshot()         {},
    onCommandsForTick()  {},
  };
}
