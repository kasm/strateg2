// Internal: rule-based MICRO layer (used by the adaptive AI).
//
// A fixed priority ladder applied to every field army unit each micro sub-tick:
//   1. retreat — low HP with an enemy in engagement range -> fall back to base
//   2. kite    — archer with a swordsman too close -> step away, keep range
//   3. focus   — concentrate fire on the weakest enemy in range
//   4. idle    — nothing tactical to do; leave the macro order intact
//
// All decisions are emitted through tactics.commitTactic, which only issues a command
// on a genuine change, so re-running this every config.ai.microEvery is cheap.

import {
  enemiesNear, pickFocusTarget, safeTile, fleeTile, commitTactic, pruneTactics,
} from './tactics.js';

/**
 * @param {import('./memory.js').AIMemory} memory
 * @param {Object} snap  - assess() snapshot
 * @param {Object} deps  - { state, config, entities, map, commands, owner, ai }
 */
export function microRules(memory, snap, deps) {
  const { config, entities, map } = deps;
  const shared = config.ai.shared;
  pruneTactics(memory, entities);

  const safe = safeTile(snap, map, config);

  for (const u of snap.fieldArmy) {
    const near = enemiesNear(snap, u.x, u.y, shared.focusTiles, config);

    // 1. Retreat — wounded and within reach of an enemy.
    if (u.hp / u.maxHp < shared.retreatHpFrac && near.length > 0 && safe) {
      commitTactic(deps, memory, u, { mode: 'retreat', tile: safe });
      continue;
    }

    // 2. Kite — archer with a melee threat (swordsman) inside the kite radius.
    if (u.kind === 'archer') {
      const melee = enemiesNear(snap, u.x, u.y, shared.kiteTiles, config)
        .filter(e => e.kind === 'swordsman');
      if (melee.length > 0) {
        const tile = fleeTile(u, melee[0].x, melee[0].y, map, config, shared.kiteTiles + 1);
        if (tile) { commitTactic(deps, memory, u, { mode: 'kite', tile }); continue; }
      }
    }

    // 3. Focus fire — strike the weakest real combatant in range.
    if (near.length > 0) {
      const target = pickFocusTarget(near);
      if (target) { commitTactic(deps, memory, u, { mode: 'attack', target }); continue; }
    }

    // 4. Nothing to micro — let the macro order stand.
    commitTactic(deps, memory, u, { mode: 'idle' });
  }
}
