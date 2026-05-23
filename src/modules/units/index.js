// PUBLIC API of the units module.
// Coordinates per-tick updates for all unit kinds and exposes the movement primitives that
// other modules (input commands, combat melee fallback) need to issue movement.

import {
  setMoveTarget as moveSetTarget,
  moveAdjacentTo as moveAdjacent,
  moveAlongPath as moveAlong,
} from './movement.internal.js';
import { updatePeasant }     from './peasant.internal.js';
import { updateMeleeUnit }   from './melee.internal.js';
import { updateArcherUnit }  from './archer.internal.js';

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
      const inside = entities.byId(u.insideBuildingId);
      if (inside) {
        u.x = (inside.tileX + inside.w / 2) * config.tile;
        u.y = (inside.tileY + inside.h / 2) * config.tile;
        u.tileX = inside.tileX + Math.floor(inside.w / 2);
        u.tileY = inside.tileY + Math.floor(inside.h / 2);
        u.path = null;
      }
      // Dispatch by declared role, not kind — a new melee/ranged/worker unit is
      // pure config. A genuinely new behaviour adds one case here.
      switch (config.unit[u.kind].role) {
        case 'worker': updatePeasant(u, dt, deps);    break;
        case 'melee':  updateMeleeUnit(u, dt, deps);  break;
        case 'ranged': updateArcherUnit(u, dt, deps); break;
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
