// Internal: advance arrows in flight, apply hits, expire.

export function stepProjectiles(dt, { state, config, entities }) {
  for (const p of state.projectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const t = p.target;
    if (!t || t.hp <= 0) { p.dead = true; continue; }
    const tx = t.type === 'building' ? (t.tileX + t.w / 2) * config.tile : t.x;
    const ty = t.type === 'building' ? (t.tileY + t.h / 2) * config.tile : t.y;
    if (Math.hypot(p.x - tx, p.y - ty) < config.tile * 0.5) {
      t.hp -= p.dmg;
      if (t.hp <= 0) entities.killEntity(t);
      p.dead = true;
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].dead) state.projectiles.splice(i, 1);
  }
}
