// Internal: tower garrison enter/exit helpers.
//
// `entities` owns `tower.garrisonIds` (a building field) and the entity-record
// mutations these helpers perform (a garrisoned unit's `insideBuildingId`,
// tile/world coords, and path/job state). Used by:
//   - killEntity() — when a garrisoned tower dies, eject everyone first.
//   - the `eject` command — player-issued bulk eject from a tower.

export function ejectFromTower(u, deps) {
  const { map, pathfinding, entities } = deps;
  const tower = entities.byId(u.insideBuildingId);
  if (!tower) return;
  const i = tower.garrisonIds.indexOf(u.id);
  if (i !== -1) tower.garrisonIds.splice(i, 1);
  u.insideBuildingId = null;
  u.path = null;
  u.job = null;
  u.jobTargetId = null;
  const spot = pathfinding.findAdjacentWalkable(tower.tileX, tower.tileY, tower.w, tower.h, u.x, u.y);
  if (spot) {
    u.tileX = spot.x; u.tileY = spot.y;
    const c = map.tileCenter(spot.x, spot.y);
    u.x = c.x; u.y = c.y;
  }
}

export function ejectAllFromTower(tower, deps) {
  const { entities } = deps;
  while (tower.garrisonIds.length > 0) {
    const u = entities.byId(tower.garrisonIds[0]);
    if (!u) { tower.garrisonIds.shift(); continue; }
    ejectFromTower(u, deps);
  }
}
