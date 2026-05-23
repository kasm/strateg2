// Internal: building per-tick updates.
//   - arrowBuilding consumes wood and produces arrows over time
//   - any building with a non-empty trainQueue advances its trainTimer and spawns units
//   - any building with a non-empty researchQueue advances its researchTimer

import { applyResearchComplete } from '../../core/research.js';

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

    if (b.kind === 'tower' && b.arrows > 0 && b.garrisonIds.length > 0) {
      const towerDef = config.building.tower;
      const qMax = config.unit.archer.quiver.max;
      b.distributeTimer += dt;
      if (b.distributeTimer >= towerDef.distributeTime) {
        b.distributeTimer = 0;
        for (const aId of b.garrisonIds) {
          if (b.arrows <= 0) break;
          const a = entities.byId(aId);
          if (a && a.arrows < qMax) { a.arrows += 1; b.arrows -= 1; }
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

    if (b.researchQueue && b.researchQueue.length > 0) {
      const job = b.researchQueue[0];
      const rDef = config.research[job.id];
      job.timer += dt;
      if (job.timer >= rDef.time) {
        b.researchQueue.shift();
        applyResearchComplete(config, state, b.owner, job.id);
      }
    }
  }
}
