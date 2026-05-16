// Pure 8-directional A* on a tile grid.
// `isWalkable(x,y)` is the only world dependency — kept as a parameter so the algorithm
// can be unit-tested against a hand-rolled mock grid.

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const SQRT2 = 1.4142;

function heur(x, y, gx, gy) {
  const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Find a path from (sx,sy) to (gx,gy). The goal tile is always treated as walkable
 * (caller's responsibility to pick a sensible adjacent goal for non-walkable targets).
 * @returns {{x:number,y:number}[] | null}  empty array if start === goal; null if unreachable.
 */
export function aStarSearch(sx, sy, gx, gy, isWalkable) {
  if (sx === gx && sy === gy) return [];
  const open = new Map();
  const closed = new Set();
  const key = (x, y) => x + ',' + y;
  open.set(key(sx, sy), { x: sx, y: sy, g: 0, f: heur(sx, sy, gx, gy), parent: null });

  let safety = 5000;
  while (open.size && safety-- > 0) {
    let cur = null;
    for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
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

    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (closed.has(key(nx, ny))) continue;
      const isGoal = (nx === gx && ny === gy);
      if (!isGoal && !isWalkable(nx, ny)) continue;
      // No corner-cutting through diagonal squeezes between solid tiles.
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(cur.x + dx, cur.y) && !isWalkable(cur.x, cur.y + dy)) continue;
      }
      const step = (dx !== 0 && dy !== 0) ? SQRT2 : 1;
      const g = cur.g + step;
      const existing = open.get(key(nx, ny));
      if (existing && existing.g <= g) continue;
      open.set(key(nx, ny), { x: nx, y: ny, g, f: g + heur(nx, ny, gx, gy), parent: cur });
    }
  }
  return null;
}

/**
 * Find the walkable tile immediately around the footprint (tx,ty,w,h) closest to (fromX,fromY).
 * @returns {{x:number,y:number} | null}
 */
export function findAdjacentWalkableTile(tx, ty, w, h, fromX, fromY, isWalkable) {
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
  candidates.sort((a, b) =>
    (a.x - fromX) ** 2 + (a.y - fromY) ** 2 -
    ((b.x - fromX) ** 2 + (b.y - fromY) ** 2),
  );
  return candidates[0];
}
