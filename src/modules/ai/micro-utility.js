// Internal: utility-scored MICRO layer (used by the utility and hybrid AIs).
//
// For each field army unit, every candidate tactic (retreat / kite / focus-fire /
// garrison / idle) is given a numeric utility score; the highest-scoring tactic wins.
// Scores combine a configurable weight (config.ai.utility.w*) with a situational
// factor in roughly [0,1], so tuning is a matter of nudging the weights.
//
// Same tactical primitives and idempotent emit path as the rule-based layer — only the
// decision rule (max-utility instead of a fixed ladder) differs.

import {
  enemiesNear, pickFocusTarget, safeTile, fleeTile, commitTactic, pruneTactics,
} from './tactics.js';

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Nearest own tower with a free garrison slot, or null. */
function openTower(snap, config, x, y) {
  const gMax = config.building.tower.garrisonMax;
  let best = null, bd = Infinity;
  for (const b of snap.myBuildings) {
    if (b.kind !== 'tower' || b.garrisonIds.length >= gMax) continue;
    const cx = (b.tileX + b.w / 2) * config.tile;
    const cy = (b.tileY + b.h / 2) * config.tile;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/**
 * @param {import('./memory.js').AIMemory} memory
 * @param {Object} snap  - assess() snapshot
 * @param {Object} deps  - { state, config, entities, map, commands, owner, ai }
 */
export function microUtility(memory, snap, deps) {
  const { config, entities, map } = deps;
  const shared = config.ai.shared;
  const w = config.ai.utility;
  pruneTactics(memory, entities);

  const safe = safeTile(snap, map, config);
  const tileR = config.tile;

  for (const u of snap.fieldArmy) {
    const near = enemiesNear(snap, u.x, u.y, shared.focusTiles, config);
    const hpFrac = u.hp / u.maxHp;
    const candidates = [];

    // idle — baseline so the unit keeps its macro order when nothing tactical applies.
    candidates.push({ score: 0.15, tactic: { mode: 'idle' } });

    // retreat — wounded with an enemy in range.
    if (hpFrac < shared.retreatHpFrac && near.length > 0 && safe) {
      const wounded = clamp01((shared.retreatHpFrac - hpFrac) / shared.retreatHpFrac);
      candidates.push({ score: w.wRetreat * (0.5 + 0.5 * wounded), tactic: { mode: 'retreat', tile: safe } });
    }

    // kite — archer with a swordsman inside the kite radius.
    if (u.kind === 'archer') {
      const melee = enemiesNear(snap, u.x, u.y, shared.kiteTiles, config)
        .filter(e => e.kind === 'swordsman');
      if (melee.length > 0) {
        const m = melee[0];
        const closeness = clamp01(1 - Math.hypot(m.x - u.x, m.y - u.y) / (shared.kiteTiles * tileR));
        const tile = fleeTile(u, m.x, m.y, map, config, shared.kiteTiles + 1);
        if (tile) candidates.push({ score: w.wKite * (0.5 + 0.5 * closeness), tactic: { mode: 'kite', tile } });
      }
    }

    // focus fire — concentrate on the weakest dangerous enemy in range.
    if (near.length > 0) {
      const target = pickFocusTarget(near);
      if (target) {
        const killable = clamp01(1 - target.hp / 30);
        const danger = clamp01(config.unit[target.kind].dmg / 8);
        candidates.push({
          score: w.wFocusFire * (0.4 + 0.4 * killable + 0.2 * danger),
          tactic: { mode: 'attack', target },
        });
      }
    }

    // garrison — safe archer tucks into a tower for the range/damage bonus.
    if (u.kind === 'archer' && near.length === 0) {
      const tower = openTower(snap, config, u.x, u.y);
      if (tower) candidates.push({ score: w.wGarrison, tactic: { mode: 'garrison', tower } });
    }

    let best = candidates[0];
    for (const c of candidates) if (c.score > best.score) best = c;
    commitTactic(deps, memory, u, best.tactic);
  }
}
