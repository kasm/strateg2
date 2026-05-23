// Internal: the "Utility AI" decision pass.
//
// Fully utility-driven: both layers score every candidate action numerically and pick
// the best, rather than following a script or a phase machine.
//   assess()       — perceive the battlefield
//   macroUtility() — utility-scored strategy (build / train / attack)
//   microUtility() — utility-scored unit tactics (retreat / kite / focus / garrison)
//
// `aiDecideUtility` is the full pass; `.microPass` is the fast micro-only sub-tick.

import { assess } from './assess.internal.js';
import { getMemory } from './memory.internal.js';
import { macroUtility } from './macro-utility.internal.js';
import { microUtility } from './micro-utility.internal.js';

export function aiDecideUtility(state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  macroUtility(memory, snap, deps);
  microUtility(memory, snap, deps);
}

aiDecideUtility.microPass = function (state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  microUtility(memory, snap, deps);
};
