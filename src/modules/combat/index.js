// PUBLIC API of the combat module.
// Resolves damage (melee + arrow projectiles) and runs building production each tick.
//
// Has a circular dependency with the units module (melee/archer need movement helpers,
// units' updateMelee/updateArcher delegate the actual attack here). Resolved via
// `attachUnits(units)` — call once after both modules are constructed.

import { meleeStep }    from './melee.internal.js';
import { archerStep }   from './ranged.internal.js';
import { stepProjectiles } from './projectiles.internal.js';
import { stepBuildings }   from './production.internal.js';

/**
 * @typedef {Object} CombatModule
 * @property {(u:Object, tgt:Object, dt:number) => void} meleeAttack
 * @property {(u:Object, tgt:Object, dt:number) => void} archerAttack
 * @property {(dt:number) => void} updateProjectiles
 * @property {(dt:number) => void} updateBuildings
 * @property {(units:import('../units/index.js').UnitsModule) => void} attachUnits
 */

/**
 * @param {{
 *   state:        import('../../core/game-state.js').GameState,
 *   config:       import('../../core/config.js').GameConfig,
 *   map:          import('../map/index.js').MapModule,
 *   entities:     import('../entities/index.js').EntitiesModule,
 *   pathfinding:  import('../pathfinding/index.js').Pathfinding,
 * }} deps
 * @returns {CombatModule}
 */
export function createCombat({ state, config, map, entities, pathfinding }) {
  let units = null;
  const deps = { state, config, map, entities, pathfinding, get units() { return units; } };

  return {
    meleeAttack:       (u, tgt, dt) => meleeStep(u, tgt, dt, deps),
    archerAttack:      (u, tgt, dt) => archerStep(u, tgt, dt, deps),
    updateProjectiles: (dt)         => stepProjectiles(dt, deps),
    updateBuildings:   (dt)         => stepBuildings(dt, deps),
    attachUnits(u)                 { units = u; },
  };
}
