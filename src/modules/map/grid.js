// Internal: tile-grid construction and footprint marking.

export function buildEmptyGrid(w, h) {
  const tiles = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push({ type: 'grass', building: null });
    tiles.push(row);
  }
  return tiles;
}

// Default forest layout for the stock map. Each entry: [tileX, tileY, width, height].
const DEFAULT_FORESTS = [
  [3, 4, 5, 3], [4, 14, 5, 3],
  [34, 4, 5, 3], [33, 14, 5, 3],
];

// Paint the stock forest layout. A resource tile carries a generic `resource`/`amount`
// pair (from config.tiles[<type>]) so the gather logic is not forest/wood-specific.
export function paintDefaultForests(tiles, w, h, forestDef) {
  for (const [fx, fy, fw, fh] of DEFAULT_FORESTS) {
    for (let y = fy; y < fy + fh; y++) {
      for (let x = fx; x < fx + fw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = tiles[y][x];
        t.type = 'forest';
        t.resource = forestDef.resource;
        t.amount = forestDef.amount;
      }
    }
  }
}
