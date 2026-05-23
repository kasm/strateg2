// PUBLIC API of the AI module. Drives each side per its state.aiType:
//   'off'      — no AI; the side is player- or network-driven.
//   'att'      — the attacking economy AI (fixed script).
//   'def'      — the defensive turtle AI (fixed script).
//   'adaptive' — phase state-machine macro + rule-based micro.
//   'utility'  — utility-scored macro + utility-scored micro.
//   'hybrid'   — phase state-machine macro + utility-scored micro.
// All are chosen from the HUD's Red AI / Blue AI dropdowns.
//
// AI does not mutate sim state directly: it inspects state read-only and submits
// commands via the dispatcher, exactly like player input. Commands take effect at
// the start of the next tick (deterministic ordering, see commands/).
//
// The three complex AIs additionally run a fast "micro sub-tick" between full decide
// passes (config.ai.microEvery) so unit tactics — focus-fire, retreat, kiting — react
// faster than the 1.5s macro cadence. att/def are plain functions with no `.microPass`
// property, so the sub-tick is a no-op for them and their behaviour is unchanged.

import { aiDecideAtt } from './decision-att.internal.js';
import { aiDecideDef } from './decision-def.internal.js';
import { aiDecideAdaptive } from './decision-adaptive.internal.js';
import { aiDecideUtility } from './decision-utility.internal.js';
import { aiDecideHybrid } from './decision-hybrid.internal.js';

// Registry of AI personalities, keyed by state.aiType value. Adding a new AI is a
// new decision-*.js module plus an entry here (and an <option> in the HUD).
const DECIDERS = {
  att: aiDecideAtt,
  def: aiDecideDef,
  adaptive: aiDecideAdaptive,
  utility: aiDecideUtility,
  hybrid: aiDecideHybrid,
};

// AIs that opt into the fast micro sub-tick.
const MICRO_AIS = new Set(['adaptive', 'utility', 'hybrid']);

/**
 * @typedef {Object} AIModule
 * @property {(dt:number) => void} updateAI   - call every tick; internally throttled.
 * @property {() => void} resetAI             - clear timers + memory (use on new game).
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
    red:  { decideTimer: 0, waveTimer: 0, microTimer: 0 },
    blue: { decideTimer: 0, waveTimer: 0, microTimer: 0 },
  };

  function updateAI(dt) {
    if (state.gameOver) return;
    for (const owner of ['red', 'blue']) {
      const type = state.aiType[owner];
      const decide = DECIDERS[type];
      if (!decide) continue; // 'off' or unknown — this side is not AI-driven
      const t = timers[owner];
      t.decideTimer -= dt;
      t.waveTimer   -= dt;
      t.microTimer  -= dt;

      // Fast micro sub-tick — complex AIs only. att/def have no `.microPass` -> skipped.
      if (MICRO_AIS.has(type) && t.microTimer <= 0) {
        t.microTimer = config.ai.microEvery;
        decide.microPass?.(state, config, entities, map, commands, t, owner);
      }

      // Macro decide tick — throttle behaviour identical to the original AI module.
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
        timers[owner].microTimer = 0;
        delete timers[owner].mem;
      }
    },
  };
}
