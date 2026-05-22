// Internal: shared STRATEGY helpers for the complex AIs (adaptive / utility / hybrid).
//
// `counterPick` reads the enemy's army composition and decides what to build/train
// against it. `shouldAttack` / `attackTarget` turn the power balance into an attack
// decision instead of the att AI's fixed "army >= 6" trigger.

/**
 * Decide army composition against the enemy's.
 *   - enemy archer-heavy  -> swordsmen (charge them down) + towers (out-range them).
 *   - enemy melee-heavy   -> archers (kite them).
 *   - unknown / balanced  -> keep the previous lean (hysteresis), default archers.
 * `memory.lastComp` gives hysteresis: a marginal enemy edge does not flip our build.
 *
 * @returns {{prefer:('swordsman'|'archer'),wantTower:boolean}}
 */
export function counterPick(snap, memory, config) {
  const ea = snap.enemyArchers.length;
  const es = snap.enemySwordsmen.length;

  let lean;
  if (ea === 0 && es === 0) {
    lean = memory.lastComp || 'archer';        // no intel yet — archers pair with towers
  } else if (es > ea) {
    lean = 'archer';                            // they go melee -> we kite
  } else if (ea > es) {
    lean = 'swordsman';                         // they go ranged -> we close distance
  } else {
    lean = memory.lastComp || 'archer';
  }
  // Hysteresis: only flip the lean when the enemy edge is clear (>= 2 units).
  if (memory.lastComp && lean !== memory.lastComp && Math.abs(ea - es) < 2) {
    lean = memory.lastComp;
  }
  memory.lastComp = lean;

  const wantTower = snap.towerCount < config.ai.shared.towerTarget &&
    (snap.enemyArmy.length >= 2 || snap.threatTiles < 16);

  return { prefer: lean, wantTower };
}

/** Defensive power a single enemy tower projects — used to discount risky attacks. */
const TOWER_THREAT = 6;

/**
 * Power my field army must exceed before committing to an attack. Scales with the
 * enemy's army power and standing towers; never zero, so a passive enemy still loses.
 */
export function requiredAttackPower(snap, config) {
  const margin = config.ai.shared.attackPowerMargin;
  return 6 + snap.enemyPower * margin + snap.enemyTowers * TOWER_THREAT;
}

/** True when my field army is strong enough to push the enemy base. */
export function shouldAttack(snap, config) {
  if (snap.fieldArmy.length < 3) return false;
  return snap.myPower >= requiredAttackPower(snap, config);
}

/**
 * Pick the enemy building to march on: the weakest non-goldMine building (finish
 * wounded structures first), tie-broken by proximity to my Town Hall.
 */
export function attackTarget(snap, config) {
  let best = null, bestScore = Infinity;
  for (const b of snap.enemyBuildings) {
    if (b.kind === 'goldMine') continue;
    const bx = (b.tileX + b.w / 2) * config.tile;
    const by = (b.tileY + b.h / 2) * config.tile;
    const dist = Math.hypot(bx - snap.thCx, by - snap.thCy);
    const score = b.hp * 10000 + dist;   // hp dominates; distance only breaks ties
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}
