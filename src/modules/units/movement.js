// Internal: tile-level movement primitives shared by all unit kinds.

export function setMoveTarget(u, gx, gy, { pathfinding }) {
  if (u.tileX === gx && u.tileY === gy) { u.path = []; return true; }
  const path = pathfinding.aStar(u.tileX, u.tileY, gx, gy);
  if (!path) { u.path = null; return false; }
  u.path = path;
  u.state = 'moving';
  return true;
}

export function moveAdjacentTo(u, e, deps) {
  let tx, ty, w, h;
  if (e.type === 'building') { tx = e.tileX; ty = e.tileY; w = e.w; h = e.h; }
  else { tx = e.tileX; ty = e.tileY; w = 1; h = 1; }

  // Already adjacent (and not standing inside the footprint)?
  if (Math.abs(u.tileX - (tx + (w - 1) / 2)) <= w / 2 + 0.5 &&
      Math.abs(u.tileY - (ty + (h - 1) / 2)) <= h / 2 + 0.5) {
    const insideX = u.tileX >= tx && u.tileX < tx + w;
    const insideY = u.tileY >= ty && u.tileY < ty + h;
    if (!(insideX && insideY)) { u.path = []; return true; }
  }
  const spot = deps.pathfinding.findAdjacentWalkable(tx, ty, w, h, u.tileX, u.tileY);
  if (!spot) return false;
  return setMoveTarget(u, spot.x, spot.y, deps);
}

export function moveAlongPath(u, dt, { config, map }) {
  if (!u.path || u.path.length === 0) {
    if (u.state === 'moving') u.state = 'idle';
    return false;
  }
  const next = u.path[0];
  const target = map.tileCenter(next.x, next.y);
  const dx = target.x - u.x, dy = target.y - u.y;
  const dist = Math.hypot(dx, dy);
  const speed = config.unit[u.kind].speed * config.tile;
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
