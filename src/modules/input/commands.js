// Internal: translate UI clicks into unit orders / build placements.

export function selectInRect(rect, shift, { state, config }) {
  if (!shift) state.selected.length = 0;
  for (const e of state.entities) {
    if (e.type !== 'unit' || e.owner !== 'red' || e.hp <= 0) continue;
    if (e.insideBuilding) continue;
    if (e.x >= rect.x && e.x <= rect.x + rect.w && e.y >= rect.y && e.y <= rect.y + rect.h) {
      if (!state.selected.includes(e)) state.selected.push(e);
    }
  }
}

export function handleLeftClick(x, y, shift, { state, entities }) {
  const e = entities.findEntityAt(x, y);
  if (!shift) state.selected.length = 0;
  if (e && e.owner === 'red') {
    if (!state.selected.includes(e)) state.selected.push(e);
  } else if (e) {
    state.selected.length = 0;
    state.selected.push(e);
  }
}

export function issueOrder(u, tgt, tile, deps) {
  const { map, entities, units } = deps;
  u.job = null; u.jobTarget = null; u.target = null; u.targetTile = null; u.path = null;

  if (tgt) {
    if (tgt.owner && tgt.owner !== u.owner && tgt.owner !== 'neutral') {
      u.job = 'attack'; u.jobTarget = tgt; return;
    }
    if (tgt.kind === 'goldMine') {
      u.job = 'gatherGold'; u.jobTarget = tgt; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'tower' && tgt.owner === u.owner && u.kind === 'archer') {
      u.job = 'enterTower'; u.jobTarget = tgt; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'arrowBuilding' && tgt.owner === u.owner) {
      u.job = 'haulWood'; u.jobTarget = tgt; return;
    }
    if (tgt.type === 'unit' && tgt.kind === 'archer' && tgt.owner === u.owner && u.kind === 'peasant') {
      const ab = entities.nearestOf(
        e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner,
        u.x, u.y,
      );
      if (ab) { u.job = 'haulArrows'; u.jobTarget = tgt; u.target = ab; return; }
    }
    units.moveAdjacentTo(u, tgt);
    return;
  }

  const t = map.tileAt(tile.x, tile.y);
  if (t && t.type === 'forest') {
    u.job = 'gatherWood'; u.targetTile = { x: tile.x, y: tile.y }; return;
  }
  if (map.isWalkable(tile.x, tile.y)) units.setMoveTarget(u, tile.x, tile.y);
}

export function attemptBuild(tx, ty, { state, config, map, entities }) {
  const kind = state.buildMode.kind;
  if (!map.canPlaceBuilding(kind, tx, ty)) return false;
  const def = config.building[kind];
  const me = state.players.red;
  if (me.gold < def.cost.gold || me.wood < def.cost.wood) return false;
  me.gold -= def.cost.gold;
  me.wood -= def.cost.wood;
  entities.makeBuilding(kind, 'red', tx, ty);
  state.buildMode = null;
  return true;
}
