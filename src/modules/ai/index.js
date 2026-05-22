// PUBLIC API of the AI module. Drives each side per its state.aiType:
//   'off' — no AI; 'att' — the attacking AI; 'def' — the defensive turtle AI.
// Runs once per `decideEvery` per owner. Blue defaults to 'att'; red defaults to 'off'.
// Both are chosen from the HUD's Red AI / Blue AI dropdowns.
//
// AI does not mutate sim state directly: it inspects state read-only and submits
// commands via the dispatcher, exactly like player input. Commands take effect at
// the start of the next tick (deterministic ordering, see commands/).

import { aiDecideAtt } from './decision-att.js';
import { aiDecideDef } from './decision-def.js';

// Registry of AI personalities, keyed by state.aiType value. Adding a new AI is a
// new decision-*.js module plus an entry here (and an <option> in the HUD).
const DECIDERS = { att: aiDecideAtt, def: aiDecideDef };

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
      const decide = DECIDERS[state.aiType[owner]];
      if (!decide) continue; // 'off' or unknown — this side is not AI-driven
      const t = timers[owner];
      t.decideTimer -= dt;
      t.waveTimer   -= dt;
      if (t.decideTimer > 0) continue;
      t.decideTimer = config.ai.decideEvery;
      decide(state, config, entities, map, commands, t, owner);
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
