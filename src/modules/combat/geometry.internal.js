// Internal: distance helpers shared by melee and ranged.
// Buildings are footprint rectangles, not points — measuring to the center underestimates
// reach near corners (a unit on the diagonal-adjacent tile is √2·(w/2) tiles from the center
// but only ~0 tiles from the wall).

export function distanceToTarget(u, tgt, tile) {
  if (tgt.type !== 'building') return Math.hypot(u.x - tgt.x, u.y - tgt.y);
  const x0 = tgt.tileX * tile, y0 = tgt.tileY * tile;
  const x1 = x0 + tgt.w * tile, y1 = y0 + tgt.h * tile;
  const dx = Math.max(x0 - u.x, 0, u.x - x1);
  const dy = Math.max(y0 - u.y, 0, u.y - y1);
  return Math.hypot(dx, dy);
}
