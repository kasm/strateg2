// Internal: per-tick update for archer. Only auto-engages while it has arrows.

import { moveAlongPath } from './movement.js';
import { doAttack } from './logistics.js';

export function updateArcherUnit(u, dt, deps) {
  const { config, entities } = deps;
  if (u.job === 'attack') { doAttack(u, dt, deps); return; }

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
      if (d <= config.unit.archer.range * config.tile) {
        u.job = 'attack'; u.jobTarget = enemy; return;
      }
    }
  }
  moveAlongPath(u, dt, deps);
}
