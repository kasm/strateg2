// Per-tick unit update. Handles movement along path, gathering, hauling, and target acquisition.
// Combat (melee swings, archer firing) lives in combat.js but is invoked from here.

function updateUnits(dt) {
  for (const u of STATE.entities) {
    if (u.type !== 'unit' || u.hp <= 0) continue;
    if (u.cooldown > 0) u.cooldown -= dt;
    updateUnit(u, dt);
  }
}

function updateUnit(u, dt) {
  // If unit has a job but no target, try to acquire one.
  if (u.kind === 'peasant') updatePeasant(u, dt);
  else if (u.kind === 'swordsman') updateMelee(u, dt);
  else if (u.kind === 'archer') updateArcher(u, dt);
}

// ---------- movement ----------

function setMoveTarget(u, gx, gy) {
  if (u.tileX === gx && u.tileY === gy) { u.path = []; return true; }
  const path = aStar(u.tileX, u.tileY, gx, gy);
  if (!path) { u.path = null; return false; }
  u.path = path;
  u.state = 'moving';
  return true;
}

// Try to move adjacent to a target entity. Returns true if a path was found.
function moveAdjacentTo(u, e) {
  let tx, ty, w, h;
  if (e.type === 'building') { tx = e.tileX; ty = e.tileY; w = e.w; h = e.h; }
  else { tx = e.tileX; ty = e.tileY; w = 1; h = 1; }
  // Already adjacent?
  if (Math.abs(u.tileX - (tx + (w - 1) / 2)) <= w / 2 + 0.5 &&
      Math.abs(u.tileY - (ty + (h - 1) / 2)) <= h / 2 + 0.5) {
    const insideX = u.tileX >= tx && u.tileX < tx + w;
    const insideY = u.tileY >= ty && u.tileY < ty + h;
    if (!(insideX && insideY)) { u.path = []; return true; }
  }
  const spot = findAdjacentWalkable(tx, ty, w, h, u.tileX, u.tileY);
  if (!spot) return false;
  return setMoveTarget(u, spot.x, spot.y);
}

function moveAlongPath(u, dt) {
  if (!u.path || u.path.length === 0) {
    if (u.state === 'moving') u.state = 'idle';
    return false;
  }
  const next = u.path[0];
  const target = tileCenter(next.x, next.y);
  const dx = target.x - u.x, dy = target.y - u.y;
  const dist = Math.hypot(dx, dy);
  const speed = CFG.unit[u.kind].speed * CFG.tile; // px/sec
  const step = speed * dt;
  if (dist <= step) {
    u.x = target.x; u.y = target.y;
    u.tileX = next.x; u.tileY = next.y;
    u.path.shift();
    if (u.path.length === 0) {
      if (u.state === 'moving') u.state = 'idle';
      return true;
    }
  } else {
    u.x += dx / dist * step;
    u.y += dy / dist * step;
  }
  return false;
}

// ---------- peasants ----------

function updatePeasant(u, dt) {
  // Auto-pick logistics work when idle and no job assigned.
  if (!u.job && u.state === 'idle') tryAutoLogistics(u);

  if (u.job === 'gatherGold') doGather(u, dt, 'gold');
  else if (u.job === 'gatherWood') doGather(u, dt, 'wood');
  else if (u.job === 'haulWood') doHaulWood(u, dt);
  else if (u.job === 'haulArrows') doHaulArrows(u, dt);
  else if (u.job === 'attack') doAttack(u, dt);
  else moveAlongPath(u, dt);
}

function tryAutoLogistics(u) {
  // Find friendly arrow building with wood deficit OR archers with arrow deficit.
  const ab = nearestOf(e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner, u.x, u.y);
  if (!ab) return;
  const def = CFG.building.arrowBuilding;
  const woodDeficit = def.woodCap - ab.wood;
  // Find archer needing arrows
  const archer = nearestOf(e => e.type === 'unit' && e.kind === 'archer' && e.owner === u.owner && e.arrows < CFG.unit.archer.quiverMax, u.x, u.y);
  const arrowDeficit = archer ? (CFG.unit.archer.quiverMax - archer.arrows) : 0;
  if (ab.arrows > 0 && arrowDeficit > 0) {
    u.job = 'haulArrows'; u.jobTarget = archer; u.target = ab; return;
  }
  if (woodDeficit > 0 && STATE.players[u.owner].wood > 0) {
    u.job = 'haulWood'; u.jobTarget = ab; return;
  }
}

function doGather(u, dt, resource) {
  // u.target should be the resource source (forest tile coords stored in u.targetTile, or goldmine entity).
  // Cycle: go to source -> gather -> go to town hall -> deposit.
  if (u.carrying && u.carrying.kind === resource && u.carrying.amount > 0) {
    // Return to town hall
    const th = nearestOf(e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner, u.x, u.y);
    if (!th) { u.job = null; return; }
    const insideX = u.tileX >= th.tileX && u.tileX < th.tileX + th.w;
    const insideY = u.tileY >= th.tileY && u.tileY < th.tileY + th.h;
    const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
    if (adj && !(insideX && insideY)) {
      STATE.players[u.owner][resource] += u.carrying.amount;
      u.carrying = null;
      // Go back for more
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, th);
    moveAlongPath(u, dt);
    return;
  }

  // Need to harvest. Find target.
  if (resource === 'gold') {
    let mine = u.jobTarget;
    if (!mine || mine.hp <= 0 || mine.gold <= 0) {
      mine = nearestOf(e => e.type === 'building' && e.kind === 'goldMine' && e.gold > 0, u.x, u.y);
      u.jobTarget = mine;
    }
    if (!mine) { u.job = null; return; }
    const adj = Math.abs(u.tileX - (mine.tileX + 1)) <= 1 && Math.abs(u.tileY - (mine.tileY + 1)) <= 1;
    const insideX = u.tileX >= mine.tileX && u.tileX < mine.tileX + mine.w;
    const insideY = u.tileY >= mine.tileY && u.tileY < mine.tileY + mine.h;
    if (adj && !(insideX && insideY)) {
      u.gatherTimer += dt;
      if (u.gatherTimer >= CFG.resources.gatherTime) {
        u.gatherTimer = 0;
        const amount = Math.min(CFG.resources.gatherAmount, mine.gold);
        mine.gold -= amount;
        u.carrying = { kind: 'gold', amount };
        if (mine.gold <= 0) killEntity(mine);
      }
      return;
    }
    if (!u.path || u.path.length === 0) {
      if (!moveAdjacentTo(u, mine)) { u.job = null; }
    }
    moveAlongPath(u, dt);
  } else {
    // wood: target a forest tile
    let tile = u.targetTile;
    if (!tile || !tileAt(tile.x, tile.y) || tileAt(tile.x, tile.y).type !== 'forest' || tileAt(tile.x, tile.y).wood <= 0) {
      tile = findNearestForestTile(u.x, u.y);
      u.targetTile = tile;
    }
    if (!tile) { u.job = null; return; }
    const adj = Math.abs(u.tileX - tile.x) <= 1 && Math.abs(u.tileY - tile.y) <= 1 && !(u.tileX === tile.x && u.tileY === tile.y);
    if (adj) {
      u.gatherTimer += dt;
      if (u.gatherTimer >= CFG.resources.gatherTime) {
        u.gatherTimer = 0;
        const t = tileAt(tile.x, tile.y);
        const amount = Math.min(CFG.resources.gatherAmount, t.wood);
        t.wood -= amount;
        u.carrying = { kind: 'wood', amount };
        if (t.wood <= 0) { t.type = 'grass'; u.targetTile = null; }
      }
      return;
    }
    // Move adjacent to forest tile
    if (!u.path || u.path.length === 0) {
      const spot = findAdjacentWalkable(tile.x, tile.y, 1, 1, u.tileX, u.tileY);
      if (!spot) { u.job = null; return; }
      setMoveTarget(u, spot.x, spot.y);
    }
    moveAlongPath(u, dt);
  }
}

function findNearestForestTile(px, py) {
  let best = null, bd = Infinity;
  for (let y = 0; y < MAP.h; y++) {
    for (let x = 0; x < MAP.w; x++) {
      const t = MAP.tiles[y][x];
      if (t.type !== 'forest' || t.wood <= 0) continue;
      const cx = x * CFG.tile + CFG.tile / 2, cy = y * CFG.tile + CFG.tile / 2;
      const d = (cx - px) ** 2 + (cy - py) ** 2;
      if (d < bd) { bd = d; best = { x, y }; }
    }
  }
  return best;
}

function doHaulWood(u, dt) {
  const ab = u.jobTarget;
  if (!ab || ab.hp <= 0) { u.job = null; u.jobTarget = null; return; }
  const def = CFG.building.arrowBuilding;
  if (ab.wood >= def.woodCap) { u.job = null; u.jobTarget = null; return; }

  if (u.carrying && u.carrying.kind === 'wood') {
    const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 && Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
    if (adj) {
      const space = def.woodCap - ab.wood;
      const give = Math.min(space, u.carrying.amount);
      ab.wood += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab);
    moveAlongPath(u, dt);
    return;
  }

  // Pickup wood from town hall stockpile
  if (STATE.players[u.owner].wood <= 0) { u.job = null; u.jobTarget = null; return; }
  const th = nearestOf(e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner, u.x, u.y);
  if (!th) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
  if (adj) {
    const take = Math.min(CFG.unit.peasant.carry, STATE.players[u.owner].wood, def.woodCap - ab.wood);
    STATE.players[u.owner].wood -= take;
    u.carrying = { kind: 'wood', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, th);
  moveAlongPath(u, dt);
}

function doHaulArrows(u, dt) {
  const ab = u.target;
  let archer = u.jobTarget;
  if (!ab || ab.hp <= 0) { u.job = null; return; }
  if (!archer || archer.hp <= 0 || archer.arrows >= CFG.unit.archer.quiverMax) {
    archer = nearestOf(e => e.type === 'unit' && e.kind === 'archer' && e.owner === u.owner && e.arrows < CFG.unit.archer.quiverMax, u.x, u.y);
    u.jobTarget = archer;
    if (!archer) { u.job = null; return; }
  }

  if (u.carrying && u.carrying.kind === 'arrows') {
    const dist = Math.hypot(u.x - archer.x, u.y - archer.y);
    if (dist <= CFG.tile * 1.5) {
      const space = CFG.unit.archer.quiverMax - archer.arrows;
      const give = Math.min(space, u.carrying.amount);
      archer.arrows += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, archer);
    moveAlongPath(u, dt);
    return;
  }

  // Pickup from arrow building
  if (ab.arrows <= 0) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 && Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
  if (adj) {
    const take = Math.min(CFG.unit.peasant.carry, ab.arrows, CFG.unit.archer.quiverMax - archer.arrows);
    ab.arrows -= take;
    u.carrying = { kind: 'arrows', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab);
  moveAlongPath(u, dt);
}

// ---------- combat-facing helpers ----------

function doAttack(u, dt) {
  const tgt = u.jobTarget;
  if (!tgt || tgt.hp <= 0) { u.job = null; u.jobTarget = null; u.state = 'idle'; return; }
  if (u.kind === 'archer') { archerAttack(u, tgt, dt); return; }
  meleeAttack(u, tgt, dt);
}

function updateMelee(u, dt) {
  if (u.job === 'attack') { doAttack(u, dt); return; }
  // Auto-acquire enemy in line of sight
  const enemy = nearestOf(e => e.owner && e.owner !== u.owner && e.owner !== 'neutral' && e.hp > 0, u.x, u.y);
  if (enemy) {
    const d = enemy.type === 'building'
      ? Math.hypot(u.x - (enemy.tileX + enemy.w / 2) * CFG.tile, u.y - (enemy.tileY + enemy.h / 2) * CFG.tile)
      : Math.hypot(u.x - enemy.x, u.y - enemy.y);
    if (d <= CFG.tile * 4) { u.job = 'attack'; u.jobTarget = enemy; return; }
  }
  moveAlongPath(u, dt);
}

function updateArcher(u, dt) {
  if (u.job === 'attack') { doAttack(u, dt); return; }
  if (u.arrows > 0) {
    const enemy = nearestOf(e => e.owner && e.owner !== u.owner && e.owner !== 'neutral' && e.hp > 0, u.x, u.y);
    if (enemy) {
      const d = enemy.type === 'building'
        ? Math.hypot(u.x - (enemy.tileX + enemy.w / 2) * CFG.tile, u.y - (enemy.tileY + enemy.h / 2) * CFG.tile)
        : Math.hypot(u.x - enemy.x, u.y - enemy.y);
      if (d <= CFG.unit.archer.range * CFG.tile) { u.job = 'attack'; u.jobTarget = enemy; return; }
    }
  }
  moveAlongPath(u, dt);
}
