// Internal: per-tick update for swordsman (and any other melee unit).
// Auto-acquires nearby enemies within a short vision radius.

import { moveAlongPath } from './movement.internal.js';
import { doAttack } from './logistics.internal.js';
import { isHostileBetween } from '../../core/factions.js';

export function updateMeleeUnit(u, dt, deps) {
  const { config, entities } = deps;
  if (u.job === 'attack') { doAttack(u, dt, deps); return; }

  const enemy = entities.nearestOf(
    e => e.owner && isHostileBetween(u.owner, e.owner) && e.hp > 0,
    u.x, u.y,
  );
  if (enemy) {
    const d = enemy.type === 'building'
      ? Math.hypot(u.x - (enemy.tileX + enemy.w / 2) * config.tile,
                   u.y - (enemy.tileY + enemy.h / 2) * config.tile)
      : Math.hypot(u.x - enemy.x, u.y - enemy.y);
    if (d <= config.tile * 4) { u.job = 'attack'; u.jobTargetId = enemy.id; return; }
  }
  moveAlongPath(u, dt, deps);
}
