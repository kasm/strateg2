// Internal: per-owner persistent AI memory for the complex AIs (adaptive / utility / hybrid).
//
// The orchestrator (index.js) keeps one timer object per owner and passes it to the
// decider as `ai`. We hang persistent decision state off that same object as `ai.mem`
// so there is no module-level mutable state — two sims, or a fresh game, never share it.
// `resetAI()` deletes `ai.mem`, so a new game starts from a clean `opening` phase.

/**
 * @typedef {Object} AIMemory
 * @property {string}  phase        - FSM phase: opening|expand|mass|push|defend
 * @property {number}  phaseSince   - state.tick the current phase was entered
 * @property {Map<number,{mode:string,key:(number|string)}>} tactic
 *   Last micro command issued per unit id — used to make micro idempotent (no per-tick thrash).
 * @property {('swordsman'|'archer'|null)} lastComp - last counter-pick lean (hysteresis).
 */

/**
 * Lazily attach and return the persistent memory for one owner.
 * @param {Object} ai - the per-owner timer object from the orchestrator.
 * @returns {AIMemory}
 */
export function getMemory(ai) {
  if (!ai.mem) {
    ai.mem = {
      phase: 'opening',
      phaseSince: 0,
      tactic: new Map(),
      lastComp: null,
    };
  }
  return ai.mem;
}
