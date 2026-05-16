// Internal: per-tick update for archer. Only auto-engages while it has arrows.

import { moveAdjacentTo, moveAlongPath } from './movement.js';
import { doAttack } from './logistics.js';

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
      const inTower = u.insideBuilding && u.insideBuilding.kind === 'tower';
      const range = config.unit.archer.range * (inTower ? config.building.tower.rangeMult : 1);
      if (d <= range * config.tile) {
        u.job = 'attack'; u.jobTarget = enemy; return;
      }
    }
  }
  if (u.insideBuilding) return;
  moveAlongPath(u, dt, deps);
}

export function ejectFromTower(u, deps) {
  const { config, map, pathfinding } = deps;
  const tower = u.insideBuilding;
  if (!tower) return;
  const i = tower.garrison.indexOf(u);
  if (i !== -1) tower.garrison.splice(i, 1);
  u.insideBuilding = null;
  u.path = null;
  u.job = null;
  u.jobTarget = null;
  const spot = pathfinding.findAdjacentWalkable(tower.tileX, tower.tileY, tower.w, tower.h, u.x, u.y);
  if (spot) {
    u.tileX = spot.x; u.tileY = spot.y;
    const c = map.tileCenter(spot.x, spot.y);
    u.x = c.x; u.y = c.y;
  }
}

export function ejectAllFromTower(tower, deps) {
  while (tower.garrison.length > 0) ejectFromTower(tower.garrison[0], deps);
}

function doEnterTower(u, dt, deps) {
  const { config } = deps;
  const tower = u.jobTarget;
  if (!tower || tower.hp <= 0 || tower.kind !== 'tower' || tower.owner !== u.owner) {
    u.job = null; u.jobTarget = null; return;
  }
  if (tower.garrison.length >= config.building.tower.garrisonMax) {
    u.job = null; u.jobTarget = null; return;
  }
  const adj = u.tileX >= tower.tileX - 1 && u.tileX <= tower.tileX + tower.w &&
              u.tileY >= tower.tileY - 1 && u.tileY <= tower.tileY + tower.h;
  if (adj) {
    tower.garrison.push(u);
    u.insideBuilding = tower;
    u.x = (tower.tileX + tower.w / 2) * config.tile;
    u.y = (tower.tileY + tower.h / 2) * config.tile;
    u.tileX = tower.tileX + Math.floor(tower.w / 2);
    u.tileY = tower.tileY + Math.floor(tower.h / 2);
    u.path = null;
    u.job = null;
    u.jobTarget = null;
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, tower, deps);
  moveAlongPath(u, dt, deps);
}
