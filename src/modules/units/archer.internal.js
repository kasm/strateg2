// Internal: per-tick update for archer. Only auto-engages while it has arrows.

import { moveAdjacentTo, moveAlongPath } from './movement.internal.js';
import { doAttack } from './logistics.internal.js';
import { unitStat } from '../../core/stats.js';

export function updateArcherUnit(u, dt, deps) {
  const { config, entities } = deps;
  if (u.job === 'attack') { doAttack(u, dt, deps); return; }
  if (u.job === 'enterTower') { doEnterTower(u, dt, deps); return; }

  if (u.arrows > 0) {
    const enemy = entities.nearestOf(
      e => e.owner && e.owner !== u.owner && e.owner !== 'neutral' && e.hp > 0,
      u.x, u.y,
    );
    if (enemy) {
      const d = enemy.type === 'building'
        ? Math.hypot(u.x - (enemy.tileX + enemy.w / 2) * config.tile,
                     u.y - (enemy.tileY + enemy.h / 2) * config.tile)
        : Math.hypot(u.x - enemy.x, u.y - enemy.y);
      const inside = entities.byId(u.insideBuildingId);
      const inTower = inside && inside.kind === 'tower';
      const range = unitStat(deps, u, 'range') * (inTower ? config.building.tower.rangeMult : 1);
      if (d <= range * config.tile) {
        u.job = 'attack'; u.jobTargetId = enemy.id; return;
      }
    }
  }
  if (u.insideBuildingId != null) return;
  moveAlongPath(u, dt, deps);
}

function doEnterTower(u, dt, deps) {
  const { config, entities } = deps;
  const tower = entities.byId(u.jobTargetId);
  if (!tower || tower.hp <= 0 || tower.kind !== 'tower' || tower.owner !== u.owner) {
    u.job = null; u.jobTargetId = null; return;
  }
  if (tower.garrisonIds.length >= config.building.tower.garrisonMax) {
    u.job = null; u.jobTargetId = null; return;
  }
  const adj = u.tileX >= tower.tileX - 1 && u.tileX <= tower.tileX + tower.w &&
              u.tileY >= tower.tileY - 1 && u.tileY <= tower.tileY + tower.h;
  if (adj) {
    tower.garrisonIds.push(u.id);
    u.insideBuildingId = tower.id;
    u.x = (tower.tileX + tower.w / 2) * config.tile;
    u.y = (tower.tileY + tower.h / 2) * config.tile;
    u.tileX = tower.tileX + Math.floor(tower.w / 2);
    u.tileY = tower.tileY + Math.floor(tower.h / 2);
    u.path = null;
    u.job = null;
    u.jobTargetId = null;
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, tower, deps);
  moveAlongPath(u, dt, deps);
}
