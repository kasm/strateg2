// Combat resolution. Swordsman/peasant: melee swings adjacent. Archer: shoots arrow projectile.

function meleeAttack(u, tgt, dt) {
  const def = CFG.unit[u.kind];
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * CFG.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * CFG.tile : tgt.y;
  const d = Math.hypot(u.x - tx, u.y - ty);
  const reach = def.range * CFG.tile + (tgt.type === 'building' ? Math.max(tgt.w, tgt.h) * CFG.tile / 2 : CFG.tile * 0.5);
  if (d > reach) {
    if (!u.path || u.path.length === 0) {
      if (!moveAdjacentTo(u, tgt)) { u.job = null; return; }
    }
    moveAlongPath(u, dt);
    return;
  }
  u.path = [];
  if (u.cooldown <= 0) {
    tgt.hp -= def.dmg;
    u.cooldown = def.cooldown;
    if (tgt.hp <= 0) {
      killEntity(tgt);
      u.job = null; u.jobTarget = null; u.state = 'idle';
    }
  }
}

function archerAttack(u, tgt, dt) {
  const def = CFG.unit.archer;
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * CFG.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * CFG.tile : tgt.y;
  const d = Math.hypot(u.x - tx, u.y - ty);
  if (u.arrows <= 0) {
    // Out of arrows: fall back to idle (visible cue handled in render).
    u.job = null; u.jobTarget = null; u.state = 'idle';
    return;
  }
  if (d > def.range * CFG.tile) {
    if (!u.path || u.path.length === 0) {
      // Move closer
      const dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y);
      const goalX = u.tileX + dx * 3, goalY = u.tileY + dy * 3;
      if (isWalkable(goalX, goalY)) setMoveTarget(u, goalX, goalY);
      else moveAdjacentTo(u, tgt);
    }
    moveAlongPath(u, dt);
    return;
  }
  u.path = [];
  if (u.cooldown <= 0) {
    spawnArrow(u, tgt);
    u.arrows -= 1;
    u.cooldown = def.cooldown;
  }
}

function spawnArrow(from, tgt) {
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * CFG.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * CFG.tile : tgt.y;
  const dx = tx - from.x, dy = ty - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = CFG.arrowSpeed * CFG.tile;
  STATE.projectiles.push({
    x: from.x, y: from.y,
    vx: dx / dist * speed,
    vy: dy / dist * speed,
    target: tgt,
    dmg: CFG.unit.archer.dmg,
    owner: from.owner,
    life: 3.0,
  });
}

function updateProjectiles(dt) {
  for (const p of STATE.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const t = p.target;
    if (!t || t.hp <= 0) { p.dead = true; continue; }
    const tx = t.type === 'building' ? (t.tileX + t.w / 2) * CFG.tile : t.x;
    const ty = t.type === 'building' ? (t.tileY + t.h / 2) * CFG.tile : t.y;
    if (Math.hypot(p.x - tx, p.y - ty) < CFG.tile * 0.5) {
      t.hp -= p.dmg;
      if (t.hp <= 0) killEntity(t);
      p.dead = true;
    }
  }
  STATE.projectiles = STATE.projectiles.filter(p => !p.dead);
}

// Arrow Building production tick
function updateBuildings(dt) {
  for (const b of STATE.entities) {
    if (b.type !== 'building' || b.hp <= 0) continue;
    if (b.kind === 'arrowBuilding') {
      const def = CFG.building.arrowBuilding;
      if (b.wood >= def.woodPerArrow && b.arrows < def.arrowCap) {
        b.arrowTimer += dt;
        if (b.arrowTimer >= def.arrowTime) {
          b.arrowTimer = 0;
          b.wood -= def.woodPerArrow;
          b.arrows += 1;
        }
      } else {
        b.arrowTimer = 0;
      }
    }
    if (b.trainQueue.length > 0) {
      const kind = b.trainQueue[0];
      const def = CFG.unit[kind];
      b.trainTimer += dt;
      if (b.trainTimer >= def.train) {
        b.trainTimer = 0;
        b.trainQueue.shift();
        // Spawn next to building
        const spot = findAdjacentWalkable(b.tileX, b.tileY, b.w, b.h, b.tileX, b.tileY);
        if (spot) {
          const unit = makeUnit(kind, b.owner, spot.x, spot.y);
          STATE.entities.push(unit);
        }
      }
    }
  }
}
