// Internal: melee swing logic. The unit closes to reach distance, then trades cooldown for damage.

import { distanceToTarget } from './geometry.js';

export function meleeStep(u, tgt, dt, { config, entities, units }) {
  const def = config.unit[u.kind];
  const d = distanceToTarget(u, tgt, config.tile);
  const reach = def.range * config.tile + (tgt.type === 'building' ? 0 : config.tile * 0.5);
  if (d > reach) {
    if (!u.path || u.path.length === 0) {
      if (!units.moveAdjacentTo(u, tgt)) { u.job = null; return; }
    }
    units.moveAlongPath(u, dt);
    return;
  }
  u.path = [];
  if (u.cooldown <= 0) {
    tgt.hp -= def.dmg;
    u.cooldown = def.cooldown;
    if (tgt.hp <= 0) {
      entities.killEntity(tgt);
      u.job = null; u.jobTargetId = null; u.state = 'idle';
    }
  }
}
