// Internal: melee swing logic. The unit closes to reach distance, then trades cooldown for damage.

import { distanceToTarget } from './geometry.js';
import { unitStat } from '../../core/stats.js';

export function meleeStep(u, tgt, dt, deps) {
  const { config, entities, units } = deps;
  const d = distanceToTarget(u, tgt, config.tile);
  const reach = unitStat(deps, u, 'range') * config.tile + (tgt.type === 'building' ? 0 : config.tile * 0.5);
  if (d > reach) {
    if (!u.path || u.path.length === 0) {
      if (!units.moveAdjacentTo(u, tgt)) { u.job = null; return; }
    }
    units.moveAlongPath(u, dt);
    return;
  }
  u.path = [];
  if (u.cooldown <= 0) {
    const armor = tgt.type === 'unit' ? unitStat(deps, tgt, 'armor') : 0;
    tgt.hp -= Math.max(1, unitStat(deps, u, 'dmg') - armor);
    u.cooldown = unitStat(deps, u, 'cooldown');
    if (tgt.hp <= 0) {
      entities.killEntity(tgt);
      u.job = null; u.jobTargetId = null; u.state = 'idle';
    }
  }
}
