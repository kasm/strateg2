// Research subsystem helpers — completion, unlock gating, per-player seeding.
//
// Per-player research state lives on the player bag as `player.research`:
//   { done: string[], pending: string[] }
//   - done    : completed research ids — feeds statMods (stats.js) and unlock gates.
//   - pending : research ids currently queued at some building (denormalised index
//               so the `research` command can reject duplicates in O(1)).
// In-progress research itself lives on the host building's `researchQueue`
// (`[{id,timer}]`), advanced per tick by combat/production.js — mirroring trainQueue.
//
// Effect types (see config.research[id].effects):
//   - 'stat'   : passive stat modifier — applied by stats.js rebuildStatMods.
//   - 'unlock' : gates a unit/building kind — applied here via isUnlocked.
//   - 'ability': reserved slot, not implemented yet.

import { rebuildStatMods } from './stats.js';

/** Seed/reset a player's research state, in place. Leaves statMods consistent. */
export function seedResearch(player, config) {
  player.research = { done: [], pending: [] };
  rebuildStatMods(config, player);
}

/**
 * Mark a research id complete for `owner`: move it pending -> done and recompute
 * that player's stat modifiers. Called when a building's researchQueue job finishes.
 */
export function applyResearchComplete(config, state, owner, id) {
  const research = state.players[owner].research;
  const pi = research.pending.indexOf(id);
  if (pi !== -1) research.pending.splice(pi, 1);
  if (!research.done.includes(id)) research.done.push(id);
  rebuildStatMods(config, state.players[owner]);
}

/**
 * Build/train gate. A unit/building `def` is unlocked unless it declares
 * `requiresResearch` and the owner has not completed that research. Default-open,
 * so existing content (no `requiresResearch`) is unaffected.
 */
export function isUnlocked(state, owner, def) {
  if (!def || !def.requiresResearch) return true;
  return !!state.players[owner]?.research?.done.includes(def.requiresResearch);
}
