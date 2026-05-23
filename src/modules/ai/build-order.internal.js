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

// Hint tiles near each owner's base for a given building kind. findGrassSpot relaxes
// outward from these, so they are starting points rather than required placements.
// Shared by the complex AIs (adaptive / utility / hybrid); att/def keep their own hints.
const BUILD_HINTS = {
  red:  { arrowBuilding: [5, 11], barracks: [6, 7], archeryRange: [3, 12], tower: [9, 9] },
  blue: { arrowBuilding: [34, 11], barracks: [34, 8], archeryRange: [36, 12], tower: [27, 9] },
};

export function buildHint(kind, owner) {
  const side = BUILD_HINTS[owner] || BUILD_HINTS.red;
  return side[kind] || side.barracks;
}
