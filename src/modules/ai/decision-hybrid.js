// Internal: the "Hybrid AI" decision pass.
//
// Phase state-machine macro (shared with the Adaptive AI) + utility-scored micro
// (shared with the Utility AI). It writes no logic of its own — it is pure composition,
// demonstrating that the macro and micro layers are independently swappable.
//
// `aiDecideHybrid` is the full pass; `.microPass` is the fast micro-only sub-tick.

import { assess } from './assess.js';
import { getMemory } from './memory.js';
import { macroFsm } from './macro-fsm.js';
import { microUtility } from './micro-utility.js';

export function aiDecideHybrid(state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  macroFsm(memory, snap, deps);
  microUtility(memory, snap, deps);
}

aiDecideHybrid.microPass = function (state, config, entities, map, commands, ai, owner) {
  const memory = getMemory(ai);
  const snap = assess(state, config, entities, map, owner);
  const deps = { state, config, entities, map, commands, owner, ai };
  microUtility(memory, snap, deps);
};
