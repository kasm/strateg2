// PUBLIC API of the pve module.
//
// Runs once per tick (as the `pveUpdate` phase, see src/core/game-loop.js).
// When config.pve.enabled is false this is a no-op — the existence of the
// module costs one function call per tick and nothing else.
//
// What it does when enabled:
//   1. Advances the wave timer.
//   2. ~announceLeadSec before each scheduled wave, pushes a 'raid-incoming'
//      event into state.events (consumed by the HUD toast renderer).
//   3. On the wave tick, spawns `waveSize` bandits per surviving banditCamp,
//      sets each bandit's job to attack the nearest enemy townHall.
//
// Bandits use the existing melee unit state machine — no new behavior code
// here. Movement, target acquisition, attacking are all in modules/units.

import { updatePVE } from './wave.internal.js';

/**
 * @typedef {Object} PVEModule
 * @property {(dt:number) => void} updatePVE
 */

/**
 * @param {{
 *   state:    import('../../core/game-state.js').GameState,
 *   config:   import('../../core/config.js').GameConfig,
 *   entities: import('../entities/index.js').EntitiesModule,
 *   units:    import('../units/index.js').UnitsModule,
 *   map:      import('../map/index.js').MapModule,
 * }} deps
 * @returns {PVEModule}
 */
export function createPVE(deps) {
  return {
    updatePVE: (dt) => updatePVE(dt, deps),
  };
}
