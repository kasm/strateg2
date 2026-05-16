// Internal: peasant gather + haul state machines.
// Each `do*` advances one tick of a multi-stage cycle: travel -> work -> travel-back -> deposit.

import { setMoveTarget, moveAdjacentTo, moveAlongPath } from './movement.js';

export function tryAutoLogistics(u, { state, config, entities }) {
  // Idle peasants self-assign to whichever logistics task is needed near them.
  const ab = entities.nearestOf(
    e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner,
    u.x, u.y,
  );
  if (!ab) return;
  const def = config.building.arrowBuilding;
  const woodDeficit = def.woodCap - ab.wood;
  const archer = entities.nearestOf(
    e => e.type === 'unit' && e.kind === 'archer' && e.owner === u.owner && e.arrows < config.unit.archer.quiverMax,
    u.x, u.y,
  );
  const arrowDeficit = archer ? (config.unit.archer.quiverMax - archer.arrows) : 0;
  if (ab.arrows > 0 && arrowDeficit > 0) {
    u.job = 'haulArrows'; u.jobTarget = archer; u.target = ab; return;
  }
  if (woodDeficit > 0 && state.players[u.owner].wood > 0) {
    u.job = 'haulWood'; u.jobTarget = ab;
  }
}

export function doGather(u, dt, resource, deps) {
  const { state, config, map, entities } = deps;

  if (u.carrying && u.carrying.kind === resource && u.carrying.amount > 0) {
    // Return to town hall to deposit.
    const th = entities.nearestOf(
      e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner,
      u.x, u.y,
    );
    if (!th) { u.job = null; return; }
    const insideX = u.tileX >= th.tileX && u.tileX < th.tileX + th.w;
    const insideY = u.tileY >= th.tileY && u.tileY < th.tileY + th.h;
    const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
    if (adj && !(insideX && insideY)) {
      state.players[u.owner][resource] += u.carrying.amount;
      u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, th, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  if (resource === 'gold') gatherGold(u, dt, deps);
  else gatherWood(u, dt, deps);
}

function gatherGold(u, dt, deps) {
  const { config, entities } = deps;
  let mine = u.jobTarget;
  if (!mine || mine.hp <= 0 || mine.gold <= 0) {
    mine = entities.nearestOf(
      e => e.type === 'building' && e.kind === 'goldMine' && e.gold > 0,
      u.x, u.y,
    );
    u.jobTarget = mine;
  }
  if (!mine) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (mine.tileX + 1)) <= 1 && Math.abs(u.tileY - (mine.tileY + 1)) <= 1;
  const insideX = u.tileX >= mine.tileX && u.tileX < mine.tileX + mine.w;
  const insideY = u.tileY >= mine.tileY && u.tileY < mine.tileY + mine.h;
  if (adj && !(insideX && insideY)) {
    u.gatherTimer += dt;
    if (u.gatherTimer >= config.resources.gatherTime) {
      u.gatherTimer = 0;
      const amount = Math.min(config.resources.gatherAmount, mine.gold);
      mine.gold -= amount;
      u.carrying = { kind: 'gold', amount };
      if (mine.gold <= 0) entities.killEntity(mine);
    }
    return;
  }
  if (!u.path || u.path.length === 0) {
    if (!moveAdjacentTo(u, mine, deps)) { u.job = null; }
  }
  moveAlongPath(u, dt, deps);
}

function gatherWood(u, dt, deps) {
  const { config, map, pathfinding } = deps;
  let tile = u.targetTile;
  const inv = (t) => !t || t.type !== 'forest' || t.wood <= 0;
  if (!tile || inv(map.tileAt(tile.x, tile.y))) {
    tile = findNearestForestTile(map, u.x, u.y, config.tile);
    u.targetTile = tile;
  }
  if (!tile) { u.job = null; return; }
  const adj = Math.abs(u.tileX - tile.x) <= 1 &&
              Math.abs(u.tileY - tile.y) <= 1 &&
              !(u.tileX === tile.x && u.tileY === tile.y);
  if (adj) {
    u.gatherTimer += dt;
    if (u.gatherTimer >= config.resources.gatherTime) {
      u.gatherTimer = 0;
      const t = map.tileAt(tile.x, tile.y);
      const amount = Math.min(config.resources.gatherAmount, t.wood);
      t.wood -= amount;
      u.carrying = { kind: 'wood', amount };
      if (t.wood <= 0) { t.type = 'grass'; u.targetTile = null; }
    }
    return;
  }
  if (!u.path || u.path.length === 0) {
    const spot = pathfinding.findAdjacentWalkable(tile.x, tile.y, 1, 1, u.tileX, u.tileY);
    if (!spot) { u.job = null; return; }
    setMoveTarget(u, spot.x, spot.y, deps);
  }
  moveAlongPath(u, dt, deps);
}

export function findNearestForestTile(map, px, py, tileSize) {
  let best = null, bd = Infinity;
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const t = map.tiles[y][x];
      if (t.type !== 'forest' || t.wood <= 0) continue;
      const cx = x * tileSize + tileSize / 2, cy = y * tileSize + tileSize / 2;
      const d = (cx - px) ** 2 + (cy - py) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

export function doHaulWood(u, dt, deps) {
  const { state, config } = deps;
  const ab = u.jobTarget;
  if (!ab || ab.hp <= 0) { u.job = null; u.jobTarget = null; return; }
  const def = config.building.arrowBuilding;
  if (ab.wood >= def.woodCap) { u.job = null; u.jobTarget = null; return; }

  if (u.carrying && u.carrying.kind === 'wood') {
    const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 &&
                Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
    if (adj) {
      const space = def.woodCap - ab.wood;
      const give = Math.min(space, u.carrying.amount);
      ab.wood += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  // Pick wood up at the town hall stockpile.
  if (state.players[u.owner].wood <= 0) { u.job = null; u.jobTarget = null; return; }
  const th = deps.entities.nearestOf(
    e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner,
    u.x, u.y,
  );
  if (!th) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
  if (adj) {
    const take = Math.min(config.unit.peasant.carry, state.players[u.owner].wood, def.woodCap - ab.wood);
    state.players[u.owner].wood -= take;
    u.carrying = { kind: 'wood', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, th, deps);
  moveAlongPath(u, dt, deps);
}

export function doHaulArrows(u, dt, deps) {
  const { config, entities } = deps;
  const ab = u.target;
  let archer = u.jobTarget;
  if (!ab || ab.hp <= 0) { u.job = null; return; }
  if (!archer || archer.hp <= 0 || archer.arrows >= config.unit.archer.quiverMax) {
    archer = entities.nearestOf(
      e => e.type === 'unit' && e.kind === 'archer' && e.owner === u.owner && e.arrows < config.unit.archer.quiverMax,
      u.x, u.y,
    );
    u.jobTarget = archer;
    if (!archer) { u.job = null; return; }
  }

  if (u.carrying && u.carrying.kind === 'arrows') {
    const dist = Math.hypot(u.x - archer.x, u.y - archer.y);
    if (dist <= config.tile * 1.5) {
      const space = config.unit.archer.quiverMax - archer.arrows;
      const give = Math.min(space, u.carrying.amount);
      archer.arrows += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, archer, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  if (ab.arrows <= 0) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 &&
              Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
  if (adj) {
    const take = Math.min(config.unit.peasant.carry, ab.arrows, config.unit.archer.quiverMax - archer.arrows);
    ab.arrows -= take;
    u.carrying = { kind: 'arrows', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab, deps);
  moveAlongPath(u, dt, deps);
}

export function doAttack(u, dt, deps) {
  const { combat } = deps;
  const tgt = u.jobTarget;
  if (!tgt || tgt.hp <= 0) { u.job = null; u.jobTarget = null; u.state = 'idle'; return; }
  if (u.kind === 'archer') { combat.archerAttack(u, tgt, dt); return; }
  combat.meleeAttack(u, tgt, dt);
}
