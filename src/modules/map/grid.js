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
  [52, 4, 5, 3], [51, 14, 5, 3],
];

export function paintDefaultForests(tiles, w, h, woodPerTile) {
  for (const [fx, fy, fw, fh] of DEFAULT_FORESTS) {
    for (let y = fy; y < fy + fh; y++) {
      for (let x = fx; x < fx + fw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = tiles[y][x];
        t.type = 'forest';
        t.wood = woodPerTile;
      }
    }
  }
}
