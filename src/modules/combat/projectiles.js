// Internal: advance arrows in flight, apply hits, expire.

export function stepProjectiles(dt, { state, config, entities }) {
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const t = p.target;
    if (!t || t.hp <= 0) { p.dead = true; continue; }
    if (hitsTarget(p, t, config.tile)) {
      t.hp -= p.dmg;
      if (t.hp <= 0) entities.killEntity(t);
      p.dead = true;
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].dead) state.projectiles.splice(i, 1);
  }
}

function hitsTarget(p, t, tile) {
  if (t.type !== 'building') {
    return Math.hypot(p.x - t.x, p.y - t.y) < tile * 0.5;
  }
  const x0 = t.tileX * tile, y0 = t.tileY * tile;
  const x1 = x0 + t.w * tile, y1 = y0 + t.h * tile;
  return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
}
