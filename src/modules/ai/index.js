// PUBLIC API of the AI module. Drives any player flagged in state.autoFight.
// Runs once per `decideEvery` per owner. Blue auto-fight defaults on; red is opt-in
// via the HUD checkbox.
//
// AI does not mutate sim state directly: it inspects state read-only and submits
// commands via the dispatcher, exactly like player input. Commands take effect at
// the start of the next tick (deterministic ordering, see commands/).

import { aiDecide } from './decision.js';

/**
 * @typedef {Object} AIModule
 * @property {(dt:number) => void} updateAI   - call every tick; internally throttled.
 * @property {() => void} resetAI             - clear timers (use on new game).
 */

/**
 * @param {{
 *   state:    import('../../core/game-state.js').GameState,
 *   config:   import('../../core/config.js').GameConfig,
 *   entities: import('../entities/index.js').EntitiesModule,
 *   map:      import('../map/index.js').MapModule,
 *   commands: import('../../commands/index.js').CommandsModule,
 * }} deps
 * @returns {AIModule}
 */
export function createAI({ state, config, entities, map, commands }) {
  const timers = {
    red:  { decideTimer: 0, waveTimer: 0 },
    blue: { decideTimer: 0, waveTimer: 0 },
  };

  function updateAI(dt) {
    if (state.gameOver) return;
    for (const owner of ['red', 'blue']) {
      if (!state.autoFight[owner]) continue;
      const t = timers[owner];
      t.decideTimer -= dt;
      t.waveTimer   -= dt;
      if (t.decideTimer > 0) continue;
      t.decideTimer = config.ai.decideEvery;
      aiDecide(state, config, entities, map, commands, t, owner);
    }
  }

  return {
    updateAI,
    resetAI() {
      for (const owner of ['red', 'blue']) {
        timers[owner].decideTimer = 0;
        timers[owner].waveTimer = 0;
      }
    },
  };
}
