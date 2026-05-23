// Internal: shared MICRO primitives for the complex AIs (adaptive / utility / hybrid).
//
// These are the tactical building blocks — finding targets and safe tiles, and an
// idempotent command emitter. Both micro layers (rule-based and utility-scored) call
// them, so unit tactics behave identically regardless of how the decision was reached.
//
// `commitTactic` is the single emit path. It compares the desired tactic against what
// the unit is already doing and submits an `order` command ONLY on a real change, so
// the fast micro sub-tick (every config.ai.microEvery) never thrashes unit paths.

/** Enemy units within `tiles` of (x, y). */
export function enemiesNear(snap, x, y, tiles, config) {
  const r = tiles * config.tile;
  return snap.enemyUnits.filter(e => Math.hypot(e.x - x, e.y - y) <= r);
}

/**
 * Pick the focus-fire target from a list of candidate enemies: the weakest real
 * combatant (lowest HP), with enemy peasants strongly deprioritised so the army
 * concentrates fire on units that can actually hurt back.
 */
export function pickFocusTarget(enemies) {
  let best = null, bestScore = Infinity;
  for (const e of enemies) {
    const score = e.hp + (e.kind === 'peasant' ? 100000 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

/** Ring-outward search for the closest walkable tile to (tx, ty). */
function nearestWalkable(map, tx, ty) {
  const cx = Math.max(0, Math.min(map.w - 1, Math.round(tx)));
  const cy = Math.max(0, Math.min(map.h - 1, Math.round(ty)));
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < map.w && y < map.h && map.isWalkable(x, y)) {
          return { x, y };
        }
      }
    }
  }
  return null;
}

/** A walkable rally tile just behind the owner's Town Hall (toward its map edge). */
export function safeTile(snap, map, config) {
  const th = snap.townHall;
  if (!th) return null;
  const cx = th.tileX + Math.floor(th.w / 2);
  const cy = th.tileY + Math.floor(th.h / 2);
  // Red bases sit on the west edge, blue on the east — retreat toward our own edge.
  const dir = snap.owner === 'red' ? -1 : 1;
  return nearestWalkable(map, cx + dir * 3, cy);
}

/** A walkable tile `tiles` away from a threat, in the direction the unit is already fleeing. */
export function fleeTile(unit, threatX, threatY, map, config, tiles) {
  let dx = unit.x - threatX, dy = unit.y - threatY;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  const tx = unit.tileX + dx * tiles;
  const ty = unit.tileY + dy * tiles;
  return nearestWalkable(map, tx, ty);
}

/**
 * Idempotently apply a desired tactic to one unit. `tactic` is one of:
 *   { mode:'attack',   target:<entity> }
 *   { mode:'garrison', tower:<building> }
 *   { mode:'retreat'|'kite', tile:{x,y} }
 *   { mode:'idle' }   - micro has no opinion; leave the macro order intact.
 * Returns true if an order command was submitted.
 */
export function commitTactic(deps, memory, unit, tactic) {
  const { commands, owner } = deps;

  if (tactic.mode === 'idle') {
    memory.tactic.delete(unit.id);
    return false;
  }

  if (tactic.mode === 'attack') {
    const t = tactic.target;
    if (!t) return false;
    // Authoritative check — the unit may already be on this target via a macro order.
    if (unit.job === 'attack' && unit.jobTargetId === t.id) {
      memory.tactic.set(unit.id, { mode: 'attack', key: t.id });
      return false;
    }
    commands.submit({ type: 'order', playerId: owner, unitIds: [unit.id],
      target: { kind: 'entity', id: t.id } });
    memory.tactic.set(unit.id, { mode: 'attack', key: t.id });
    return true;
  }

  if (tactic.mode === 'garrison') {
    const tw = tactic.tower;
    if (!tw) return false;
    if (unit.job === 'enterTower' && unit.jobTargetId === tw.id) {
      memory.tactic.set(unit.id, { mode: 'garrison', key: tw.id });
      return false;
    }
    commands.submit({ type: 'order', playerId: owner, unitIds: [unit.id],
      target: { kind: 'entity', id: tw.id } });
    memory.tactic.set(unit.id, { mode: 'garrison', key: tw.id });
    return true;
  }

  // 'retreat' / 'kite' — move orders. Keyed by destination tile so a stable goal
  // is not re-issued every sub-tick; a moving threat (kite) updates the key naturally.
  const tile = tactic.tile;
  if (!tile) return false;
  const key = `${tactic.mode}:${tile.x},${tile.y}`;
  const prev = memory.tactic.get(unit.id);
  if (prev && prev.mode === tactic.mode && prev.key === key) return false;
  commands.submit({ type: 'order', playerId: owner, unitIds: [unit.id],
    target: { kind: 'tile', x: tile.x, y: tile.y } });
  memory.tactic.set(unit.id, { mode: tactic.mode, key });
  return true;
}

/** Drop tactic memory for units that no longer exist (called once per micro pass). */
export function pruneTactics(memory, entities) {
  for (const id of memory.tactic.keys()) {
    if (!entities.byId(id)) memory.tactic.delete(id);
  }
}
