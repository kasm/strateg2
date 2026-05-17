// Internal: ring-outward search around (cx, cy) for the closest tile where `kind` fits.
// Used by the AI to pick a placement tile before submitting a `build` command.

export function findGrassSpot(kind, cx, cy, radius, map) {
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (map.canPlaceBuilding(kind, x, y)) return { x, y };
      }
    }
  }
  return null;
}
