// 8-directional A* on the tile grid. Returns array of {x,y} tiles from start (exclusive) to goal (inclusive),
// or null if unreachable. Treats `goalTile` as walkable even if it's a building (for "attack/gather adjacent" paths
// you should pass an adjacent walkable tile).

function aStar(sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return [];
  const open = new Map(); // key "x,y" -> node
  const closed = new Set();
  const key = (x, y) => x + ',' + y;
  const startNode = { x: sx, y: sy, g: 0, f: heur(sx, sy, gx, gy), parent: null };
  open.set(key(sx, sy), startNode);

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  let safety = 5000;
  while (open.size && safety-- > 0) {
    // Pick lowest-f node
    let cur = null;
    for (const n of open.values()) {
      if (!cur || n.f < cur.f) cur = n;
    }
    if (!cur) break;
    open.delete(key(cur.x, cur.y));
    closed.add(key(cur.x, cur.y));

    if (cur.x === gx && cur.y === gy) {
      const out = [];
      let n = cur;
      while (n && n.parent) { out.push({ x: n.x, y: n.y }); n = n.parent; }
      out.reverse();
      return out;
    }

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (closed.has(key(nx, ny))) continue;
      // Allow goal tile even if not walkable (caller's responsibility to pick a sensible goal).
      const isGoal = (nx === gx && ny === gy);
      if (!isGoal && !isWalkable(nx, ny)) continue;
      // Prevent diagonal squeezing through building corners
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(cur.x + dx, cur.y) && !isWalkable(cur.x, cur.y + dy)) continue;
      }
      const step = (dx !== 0 && dy !== 0) ? 1.4142 : 1;
      const g = cur.g + step;
      const existing = open.get(key(nx, ny));
      if (existing && existing.g <= g) continue;
      const node = { x: nx, y: ny, g, f: g + heur(nx, ny, gx, gy), parent: cur };
      open.set(key(nx, ny), node);
    }
  }
  return null;
}

function heur(x, y, gx, gy) {
  const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
  return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
}

// Find a walkable tile adjacent to (tx,ty) closest to (fromX,fromY).
function findAdjacentWalkable(tx, ty, w, h, fromX, fromY) {
  const candidates = [];
  for (let y = ty - 1; y <= ty + h; y++) {
    for (let x = tx - 1; x <= tx + w; x++) {
      const insideX = x >= tx && x < tx + w;
      const insideY = y >= ty && y < ty + h;
      if (insideX && insideY) continue;
      if (!isWalkable(x, y)) continue;
      candidates.push({ x, y });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const da = (a.x - fromX) ** 2 + (a.y - fromY) ** 2;
    const db = (b.x - fromX) ** 2 + (b.y - fromY) ** 2;
    return da - db;
  });
  return candidates[0];
}
