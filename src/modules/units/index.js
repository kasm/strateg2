// PUBLIC API of the units module.
// Coordinates per-tick updates for all unit kinds and exposes the movement primitives that
// other modules (input commands, combat melee fallback) need to issue movement.

import {
  setMoveTarget as moveSetTarget,
  moveAdjacentTo as moveAdjacent,
  moveAlongPath as moveAlong,
} from './movement.js';
import { updatePeasant }     from './peasant.js';
import { updateMeleeUnit }   from './melee.js';
import { updateArcherUnit }  from './archer.js';

/**
 * @typedef {Object} UnitsModule
 * @property {(dt:number) => void} updateUnits
 *   Advance every alive unit by one tick (dispatches by kind).
 * @property {(u:Object, gx:number, gy:number) => boolean} setMoveTarget
 *   Assign u a tile-path to (gx,gy). Returns false if unreachable.
 * @property {(u:Object, e:Object) => boolean} moveAdjacentTo
 *   Path u to the nearest walkable tile adjacent to entity e's footprint.
 * @property {(u:Object, dt:number) => boolean} moveAlongPath
 *   Advance u one step along its current path. Returns true when the final step completes.
 */

/**
 * @param {{
 *   state:        import('../../core/game-state.js').GameState,
 *   config:       import('../../core/config.js').GameConfig,
 *   map:          import('../map/index.js').MapModule,
 *   pathfinding:  import('../pathfinding/index.js').Pathfinding,
 *   entities:     import('../entities/index.js').EntitiesModule,
 *   combat:       import('../combat/index.js').CombatModule,
 * }} deps
 * @returns {UnitsModule}
 */
export function createUnits({ state, config, map, pathfinding, entities, combat }) {
  const deps = { state, config, map, pathfinding, entities, combat };

  function updateUnits(dt) {
    for (const u of state.entities) {
      if (u.type !== 'unit' || u.hp <= 0) continue;
      if (u.cooldown > 0) u.cooldown -= dt;
      switch (u.kind) {
        case 'peasant':   updatePeasant(u, dt, deps);    break;
        case 'swordsman': updateMeleeUnit(u, dt, deps);  break;
        case 'archer':    updateArcherUnit(u, dt, deps); break;
      }
    }
  }

  return {
    updateUnits,
    setMoveTarget:  (u, gx, gy) => moveSetTarget(u, gx, gy, deps),
    moveAdjacentTo: (u, e)       => moveAdjacent(u, e, deps),
    moveAlongPath:  (u, dt)      => moveAlong(u, dt, deps),
  };
}
