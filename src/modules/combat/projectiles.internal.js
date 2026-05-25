// Internal: advance arrows in flight, apply hits, expire.
// Uses swept (segment) collision against the target so fast arrows can't tunnel through
// moving units between discrete frames — per-tick step is 384/30 ≈ 13 px, which is wider
// than half a unit's hit circle, so a point-in-circle check at frame boundaries misses often.

export function stepProjectiles(dt, { state, config, entities }) {
  for (const p of state.projectiles) {
    const target = entities.byId(p.targetId);
    // Always-hit mode: re-aim the arrow at the target's current position each frame,
    // preserving its current speed. The existing segment-circle hit check then registers
    // a hit naturally the frame the homing arrow enters the 16-px radius.
    if (state.alwaysHit && target && target.hp > 0) {
      const speed = Math.hypot(p.vx, p.vy);
      const tx = target.type === 'building'
        ? (target.tileX + target.w / 2) * config.tile
        : target.x;
      const ty = target.type === 'building'
        ? (target.tileY + target.h / 2) * config.tile
        : target.y;
      const ddx = tx - p.x, ddy = ty - p.y;
      const dd = Math.hypot(ddx, ddy) || 1;
      p.vx = ddx / dd * speed;
      p.vy = ddy / dd * speed;
    }
    const x0 = p.x, y0 = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const hit = findHit(x0, y0, p.x, p.y, p, target, state.entities, config.tile);
    if (hit) {
      hit.hp -= p.dmg;
      if (hit.hp <= 0) entities.killEntity(hit, p.owner);
      p.dead = true;
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    if (state.projectiles[i].dead) state.projectiles.splice(i, 1);
  }
}

// Any enemy unit along the segment intercepts the arrow before its assigned
// target — otherwise a swordsman standing between archer and a building target
// would never take damage. We also stay in flight after the assigned target
// dies (focus-fire would otherwise waste every arrow already on the way).
function findHit(x0, y0, x1, y1, p, target, entities, tile) {
  for (const e of entities) {
    if (e.type !== 'unit' || e.hp <= 0) continue;
    if (e.insideBuildingId != null) continue;
    if (!e.owner || e.owner === p.owner || e.owner === 'neutral') continue;
    if (segmentCircle(x0, y0, x1, y1, e.x, e.y, tile * 0.5)) return e;
  }
  if (target && target.hp > 0 && target.insideBuildingId == null &&
      segmentHitsTarget(x0, y0, x1, y1, target, tile)) {
    return target;
  }
  return null;
}

function segmentHitsTarget(x0, y0, x1, y1, t, tile) {
  if (t.type !== 'building') return segmentCircle(x0, y0, x1, y1, t.x, t.y, tile * 0.5);
  const rx0 = t.tileX * tile, ry0 = t.tileY * tile;
  const rx1 = rx0 + t.w * tile, ry1 = ry0 + t.h * tile;
  return segmentRect(x0, y0, x1, y1, rx0, ry0, rx1, ry1);
}

function segmentCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + t * dx, py = y0 + t * dy;
  return Math.hypot(px - cx, py - cy) < r;
}

function segmentRect(x0, y0, x1, y1, rx0, ry0, rx1, ry1) {
  const inside = (x, y) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;
  if (inside(x0, y0) || inside(x1, y1)) return true;
  return (
    segmentsCross(x0, y0, x1, y1, rx0, ry0, rx1, ry0) ||
    segmentsCross(x0, y0, x1, y1, rx1, ry0, rx1, ry1) ||
    segmentsCross(x0, y0, x1, y1, rx1, ry1, rx0, ry1) ||
    segmentsCross(x0, y0, x1, y1, rx0, ry1, rx0, ry0)
  );
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = side(cx, cy, dx, dy, ax, ay);
  const d2 = side(cx, cy, dx, dy, bx, by);
  const d3 = side(ax, ay, bx, by, cx, cy);
  const d4 = side(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function side(ax, ay, bx, by, px, py) {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}
