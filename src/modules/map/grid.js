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

// Default forest layout — one ~5x3 patch per quadrant, inset from each map edge.
// Returns an array of [tileX, tileY, width, height] entries. The legacy 36x20
// layout is reproduced exactly so the stock map is unchanged; larger maps get
// symmetric patches placed proportionally.
export function defaultForests(w, h) {
  if (w === 36 && h === 20) {
    return [[3, 4, 5, 3], [4, 14, 5, 3], [34, 4, 5, 3], [33, 14, 5, 3]];
  }
  const fw = 5, fh = 3;
  const xLeft  = 3;
  const xRight = Math.max(xLeft + fw + 2, w - fw - 3);
  const yTop   = Math.max(2, Math.round(h * 0.20));
  const yBot   = Math.max(yTop + fh + 2, Math.round(h * 0.70));
  return [
    [xLeft,  yTop, fw, fh],
    [xLeft,  yBot, fw, fh],
    [xRight, yTop, fw, fh],
    [xRight, yBot, fw, fh],
  ];
}

// Paint the stock forest layout. A resource tile carries a generic `resource`/`amount`
// pair (from config.tiles[<type>]) so the gather logic is not forest/wood-specific.
export function paintDefaultForests(tiles, w, h, forestDef) {
  for (const [fx, fy, fw, fh] of defaultForests(w, h)) {
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
