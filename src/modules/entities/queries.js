// Internal: pure query helpers. All take the entity array explicitly.

export function findEntityAtPx(entities, px, py, tileSize) {
  // Reverse iteration so the most-recently-added (visually on top) wins.
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    if (e.type === 'building') {
      const x0 = e.tileX * tileSize, y0 = e.tileY * tileSize;
      const x1 = x0 + e.w * tileSize, y1 = y0 + e.h * tileSize;
      if (px >= x0 && px < x1 && py >= y0 && py < y1) return e;
    } else {
      const dx = px - e.x, dy = py - e.y;
      if (dx * dx + dy * dy <= (tileSize * 0.45) ** 2) return e;
    }
  }
  return null;
}

export function nearestEntity(entities, filter, fromX, fromY, tileSize) {
  let best = null, bd = Infinity;
  for (const e of entities) {
    if (e.hp <= 0) continue;
    if (!filter(e)) continue;
    const ex = e.type === 'building' ? (e.tileX + e.w / 2) * tileSize : e.x;
    const ey = e.type === 'building' ? (e.tileY + e.h / 2) * tileSize : e.y;
    const d = (ex - fromX) ** 2 + (ey - fromY) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function entitiesOfKindOwner(entities, type, owner) {
  return entities.filter(e => e.type === type && e.owner === owner && e.hp > 0);
}
