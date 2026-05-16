// Internal: try to place a blue-owned building near a hint tile. Spends resources if it lands.
// Falls back to scanning outward from the player's town hall when the hint area is full.

export function tryAIBuild(kind, hintX, hintY, { state, config, map, entities }) {
  const def = config.building[kind];
  const me = state.players.blue;
  if (me.gold < def.cost.gold || me.wood < def.cost.wood) return false;

  let spot = findGrassSpot(kind, hintX, hintY, 10, map);
  if (!spot) {
    const th = entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    if (th) spot = findGrassSpot(kind, th.tileX + 1, th.tileY + 1, 14, map);
  }
  if (!spot) return false;

  me.gold -= def.cost.gold;
  me.wood -= def.cost.wood;
  entities.makeBuilding(kind, 'blue', spot.x, spot.y);
  return true;
}

// Ring-outward search around (cx, cy). Returns the closest valid placement tile or null.
function findGrassSpot(kind, cx, cy, radius, map) {
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
