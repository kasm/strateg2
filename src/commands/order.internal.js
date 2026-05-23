// 'order' command: assign job (move / attack / gather / haul / enter tower) to one or more units.
//
// Shape:
//   { type:'order', playerId, tick, seq,
//     unitIds: number[],
//     target:  { kind:'tile',   x, y }
//            | { kind:'entity', id } }
//
// Mirrors the per-unit logic that issueOrder() used to do directly from input.
// Now lives behind validate/apply so input, AI, and (future) network all share it.

/**
 * Read-only legality check. Apply-time still re-checks per-unit ownership/aliveness
 * (a unit may have died between submit and apply on a future server-authoritative tick).
 */
export function validateOrder(_deps, cmd) {
  if (!Array.isArray(cmd.unitIds) || cmd.unitIds.length === 0) {
    return { ok: false, reason: 'no units' };
  }
  const t = cmd.target;
  if (!t || (t.kind !== 'tile' && t.kind !== 'entity')) {
    return { ok: false, reason: 'bad target' };
  }
  if (t.kind === 'tile' && (typeof t.x !== 'number' || typeof t.y !== 'number')) {
    return { ok: false, reason: 'bad tile' };
  }
  if (t.kind === 'entity' && typeof t.id !== 'number') {
    return { ok: false, reason: 'bad entity id' };
  }
  return { ok: true };
}

export function applyOrder(deps, cmd) {
  const { state, config, map, entities, units, pathfinding } = deps;
  const tgt  = cmd.target.kind === 'entity' ? entities.byId(cmd.target.id) : null;
  const tile = cmd.target.kind === 'tile'   ? { x: cmd.target.x, y: cmd.target.y } : null;

  for (const uid of cmd.unitIds) {
    const u = entities.byId(uid);
    if (!u || u.hp <= 0 || u.type !== 'unit') continue;
    if (u.owner !== cmd.playerId) continue;  // can't order other players' units
    issueOrderTo(u, tgt, tile, { state, config, map, entities, units, pathfinding });
  }
}

/**
 * Per-unit order resolution. Pulled out of input/commands.js so the same logic
 * runs whether the order arrives via mouse, AI, or network.
 */
export function issueOrderTo(u, tgt, tile, deps) {
  const { config, map, entities, units } = deps;
  u.job = null; u.jobTargetId = null; u.targetId = null; u.targetTile = null;
  u.gatherResource = null; u.path = null;

  if (tgt) {
    if (tgt.owner && tgt.owner !== u.owner && tgt.owner !== 'neutral') {
      u.job = 'attack'; u.jobTargetId = tgt.id; return;
    }
    // Resource node (e.g. gold mine) — any building whose def carries a `node` payload.
    const node = tgt.type === 'building' ? config.building[tgt.kind]?.node : null;
    if (node) {
      u.job = 'gather'; u.gatherResource = node.resource; u.jobTargetId = tgt.id; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'tower' && tgt.owner === u.owner && u.kind === 'archer') {
      u.job = 'enterTower'; u.jobTargetId = tgt.id; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'arrowBuilding' && tgt.owner === u.owner) {
      u.job = 'haulWood'; u.jobTargetId = tgt.id; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'tower' && tgt.owner === u.owner && u.kind === 'peasant') {
      const ab = entities.nearestOf(
        e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner,
        u.x, u.y,
      );
      if (ab) { u.job = 'haulArrows'; u.jobTargetId = tgt.id; u.targetId = ab.id; return; }
    }
    if (tgt.type === 'unit' && tgt.kind === 'archer' && tgt.owner === u.owner && u.kind === 'peasant') {
      const ab = entities.nearestOf(
        e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner,
        u.x, u.y,
      );
      if (ab) { u.job = 'haulArrows'; u.jobTargetId = tgt.id; u.targetId = ab.id; return; }
    }
    units.moveAdjacentTo(u, tgt);
    return;
  }

  if (!tile) return;
  const t = map.tileAt(tile.x, tile.y);
  // Gatherable tile — type declared in config.tiles with the resource it yields.
  const tileDef = t ? config.tiles[t.type] : null;
  if (tileDef && t.amount > 0) {
    u.job = 'gather'; u.gatherResource = tileDef.resource;
    u.targetTile = { x: tile.x, y: tile.y }; return;
  }
  if (map.isWalkable(tile.x, tile.y)) units.setMoveTarget(u, tile.x, tile.y);
}
