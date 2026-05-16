// PUBLIC API of the AI module. Drives the blue computer player.

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
 * }} deps
 * @returns {AIModule}
 */
export function createAI({ state, config, entities, map }) {
  const ai = { decideTimer: 0, waveTimer: 0 };

  function updateAI(dt) {
    if (state.gameOver) return;
    ai.decideTimer -= dt;
    ai.waveTimer   -= dt;
    if (ai.decideTimer > 0) return;
    ai.decideTimer = config.ai.decideEvery;
    aiDecide(state, config, entities, map, ai);
  }

  return {
    updateAI,
    resetAI() { ai.decideTimer = 0; ai.waveTimer = 0; },
  };
}
