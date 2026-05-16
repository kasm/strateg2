// Internal: melee swing logic. The unit closes to reach distance, then trades cooldown for damage.

export function meleeStep(u, tgt, dt, { config, entities, units }) {
  const def = config.unit[u.kind];
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * config.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * config.tile : tgt.y;
  const d = Math.hypot(u.x - tx, u.y - ty);
  const reach = def.range * config.tile +
                (tgt.type === 'building' ? Math.max(tgt.w, tgt.h) * config.tile / 2 : config.tile * 0.5);
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
      u.job = null; u.jobTarget = null; u.state = 'idle';
    }
  }
}
