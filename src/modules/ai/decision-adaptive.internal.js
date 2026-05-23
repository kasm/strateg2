// Internal: the "Adaptive AI" decision pass.
//
// A thin composition of shared layers:
//   assess()   — perceive the battlefield (one snapshot per pass)
//   macroFsm() — phase state-machine strategy (opening -> expand -> mass -> push -> defend)
//   microRules() — rule-based unit tactics (retreat / kite / focus-fire)
//
// `aiDecideAdaptive` is the full decide pass (macro + micro). `.microPass` runs only the
// micro layer and is called on the fast sub-tick by the orchestrator (see index.js).

import { assess } from './assess.internal.js';
import { getMemory } from './memory.internal.js';
import { macroFsm } from './macro-fsm.internal.js';
import { microRules } from './micro-rules.internal.js';

export function aiDecideAdaptive(state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  macroFsm(memory, snap, deps);
  microRules(memory, snap, deps);
}

aiDecideAdaptive.microPass = function (state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  microRules(memory, snap, deps);
};
