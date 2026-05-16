// Internal: building per-tick updates.
//   - arrowBuilding consumes wood and produces arrows over time
//   - any building with a non-empty trainQueue advances its trainTimer and spawns units

export function stepBuildings(dt, { state, config, entities, pathfinding }) {
  for (const b of state.entities) {
    if (b.type !== 'building' || b.hp <= 0) continue;

    if (b.kind === 'arrowBuilding') {
      const def = config.building.arrowBuilding;
      if (b.wood >= def.woodPerArrow && b.arrows < def.arrowCap) {
        b.arrowTimer += dt;
        if (b.arrowTimer >= def.arrowTime) {
          b.arrowTimer = 0;
          b.wood -= def.woodPerArrow;
          b.arrows += 1;
        }
      } else {
        b.arrowTimer = 0;
      }
    }

    if (b.kind === 'tower' && b.arrows > 0 && b.garrison.length > 0) {
      const towerDef = config.building.tower;
      const qMax = config.unit.archer.quiverMax;
      b.distributeTimer += dt;
      if (b.distributeTimer >= towerDef.distributeTime) {
        b.distributeTimer = 0;
        for (const a of b.garrison) {
          if (b.arrows <= 0) break;
          if (a.arrows < qMax) { a.arrows += 1; b.arrows -= 1; }
        }
      }
    }

    if (b.trainQueue.length > 0) {
      const kind = b.trainQueue[0];
      const def = config.unit[kind];
      b.trainTimer += dt;
      if (b.trainTimer >= def.train) {
        b.trainTimer = 0;
        b.trainQueue.shift();
        const spot = pathfinding.findAdjacentWalkable(b.tileX, b.tileY, b.w, b.h, b.tileX, b.tileY);
        if (spot) entities.makeUnit(kind, b.owner, spot.x, spot.y);
      }
    }
  }
}
