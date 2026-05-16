// Internal: archer attack + arrow projectile spawn.

import { distanceToTarget } from './geometry.js';

export function archerStep(u, tgt, dt, { state, config, map, units }) {
  const def = config.unit.archer;
  const tx = tgt.type === 'building' ? (tgt.tileX + tgt.w / 2) * config.tile : tgt.x;
  const ty = tgt.type === 'building' ? (tgt.tileY + tgt.h / 2) * config.tile : tgt.y;
  const d = distanceToTarget(u, tgt, config.tile);

  const inTower = u.insideBuilding && u.insideBuilding.kind === 'tower';
  const rangeMul = inTower ? config.building.tower.rangeMult : 1;
  const dmgMul   = inTower ? config.building.tower.dmgMult   : 1;
  const rangePx = def.range * rangeMul * config.tile;

  if (u.arrows <= 0) {
    u.job = null; u.jobTarget = null; u.state = 'idle';
    return;
  }

  if (d > rangePx) {
    if (inTower) { u.path = []; return; }
    if (!u.path || u.path.length === 0) {
      const dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y);
      const goalX = u.tileX + dx * 3, goalY = u.tileY + dy * 3;
      if (map.isWalkable(goalX, goalY)) units.setMoveTarget(u, goalX, goalY);
      else units.moveAdjacentTo(u, tgt);
    }
    units.moveAlongPath(u, dt);
    return;
  }

  u.path = [];
  if (u.cooldown <= 0) {
    spawnArrow(state, config, u, tgt, dmgMul);
    u.arrows -= 1;
    u.cooldown = def.cooldown;
  }
}

function spawnArrow(state, config, from, tgt, dmgMul = 1) {
  const speed = config.arrowSpeed * config.tile;
  const { x: tx, y: ty } = leadingAimPoint(from, tgt, config, speed);
  const dx = tx - from.x, dy = ty - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  state.projectiles.push({
    x: from.x, y: from.y,
    vx: dx / dist * speed,
    vy: dy / dist * speed,
    target: tgt,
    dmg: config.unit.archer.dmg * dmgMul,
    owner: from.owner,
    life: 3.0,
  });
}

// Aim where the target will be when the arrow arrives, not where it is now.
// Without this, a swordsman walking the last tile to the wall easily steps out
// of the 16-px hit circle during the arrow's ~0.5 s flight.
function leadingAimPoint(from, tgt, config, arrowSpeed) {
  if (tgt.type === 'building') {
    return {
      x: (tgt.tileX + tgt.w / 2) * config.tile,
      y: (tgt.tileY + tgt.h / 2) * config.tile,
    };
  }
  const vel = estimateVelocity(tgt, config);
  // Solve |from + arrowSpeed * t * dir| ≈ |tgt + vel * t|, approximated by
  // estimating impact time from current distance / arrow speed and iterating once.
  const d0 = Math.hypot(tgt.x - from.x, tgt.y - from.y);
  let t = d0 / arrowSpeed;
  const px = tgt.x + vel.vx * t;
  const py = tgt.y + vel.vy * t;
  const d1 = Math.hypot(px - from.x, py - from.y);
  t = d1 / arrowSpeed;
  return { x: tgt.x + vel.vx * t, y: tgt.y + vel.vy * t };
}

function estimateVelocity(u, config) {
  if (!u.path || u.path.length === 0) return { vx: 0, vy: 0 };
  const next = u.path[0];
  const tile = config.tile;
  const nx = next.x * tile + tile / 2, ny = next.y * tile + tile / 2;
  const dx = nx - u.x, dy = ny - u.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) return { vx: 0, vy: 0 };
  const speed = config.unit[u.kind].speed * tile;
  return { vx: dx / dist * speed, vy: dy / dist * speed };
}
