// Internal: archer attack + arrow projectile spawn.

export function archerStep(u, tgt, dt, { state, config, map, units }) {
  const def = config.unit.archer;
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * config.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * config.tile : tgt.y;
  const d = Math.hypot(u.x - tx, u.y - ty);

  if (u.arrows <= 0) {
    u.job = null; u.jobTarget = null; u.state = 'idle';
    return;
  }

  if (d > def.range * config.tile) {
    if (!u.path || u.path.length === 0) {
      const dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y);
      const goalX = u.tileX + dx * 3, goalY = u.tileY + dy * 3;
      if (map.isWalkable(goalX, goalY)) units.setMoveTarget(u, goalX, goalY);
      else units.moveAdjacentTo(u, tgt);
    }
    units.moveAlongPath(u, dt);
    return;
  }

  u.path = [];
  if (u.cooldown <= 0) {
    spawnArrow(state, config, u, tgt);
    u.arrows -= 1;
    u.cooldown = def.cooldown;
  }
}

function spawnArrow(state, config, from, tgt) {
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * config.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * config.tile : tgt.y;
  const dx = tx - from.x, dy = ty - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = config.arrowSpeed * config.tile;
  state.projectiles.push({
    x: from.x, y: from.y,
    vx: dx / dist * speed,
    vy: dy / dist * speed,
    target: tgt,
    dmg: config.unit.archer.dmg,
    owner: from.owner,
    life: 3.0,
  });
}
