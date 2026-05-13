// Tile grid. Tile types: 'grass' | 'forest' | 'goldmine' | 'blocked'
// Buildings sit on top of tiles and mark them as occupied via tile.building.

const MAP = {
  w: CFG.mapW,
  h: CFG.mapH,
  tiles: [],
};

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP.w || y >= MAP.h) return null;
  return MAP.tiles[y][x];
}

function isWalkable(x, y, forUnit) {
  const t = tileAt(x, y);
  if (!t) return false;
  if (t.type === 'blocked') return false;
  if (t.building) return false; // buildings block movement
  // Forest/goldmine are walkable so units can stand adjacent or pass through edges.
  // We'll allow walking through them — gathering targets the tile itself.
  return true;
}

function isAdjacent(ax, ay, bx, by) {
  return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1 && !(ax === bx && ay === by);
}

function worldToTile(px, py) {
  return { x: Math.floor(px / CFG.tile), y: Math.floor(py / CFG.tile) };
}

function tileCenter(tx, ty) {
  return { x: tx * CFG.tile + CFG.tile / 2, y: ty * CFG.tile + CFG.tile / 2 };
}

function initMap() {
  MAP.tiles = [];
  for (let y = 0; y < MAP.h; y++) {
    const row = [];
    for (let x = 0; x < MAP.w; x++) {
      row.push({ type: 'grass', building: null });
    }
    MAP.tiles.push(row);
  }

  // Forest patches on left and right
  const forests = [
    [3, 4, 5, 3], [4, 14, 5, 3],
    [22, 4, 5, 3], [23, 14, 5, 3],
  ];
  for (const [fx, fy, fw, fh] of forests) {
    for (let y = fy; y < fy + fh; y++) {
      for (let x = fx; x < fx + fw; x++) {
        const t = tileAt(x, y);
        if (t) { t.type = 'forest'; t.wood = CFG.resources.forestWood; }
      }
    }
  }
}

// Mark/unmark building footprint on the grid.
function setBuildingTiles(building, mark) {
  const def = CFG.building[building.kind];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(building.tileX + dx, building.tileY + dy);
      if (t) t.building = mark ? building : null;
    }
  }
}

function canPlaceBuilding(kind, tx, ty) {
  const def = CFG.building[kind];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(tx + dx, ty + dy);
      if (!t) return false;
      if (t.type !== 'grass') return false;
      if (t.building) return false;
    }
  }
  return true;
}
