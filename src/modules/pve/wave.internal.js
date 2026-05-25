// Internal: wave director.
//
// Tracks a single global wave timer (ticks until the next wave). Every camp
// participates in the same wave — that keeps the model simple and easy to
// balance, and matches the player's mental picture ("a raid is happening").
//
// Timer flow (TICK_DT = 1/30):
//   - waveTimer counts seconds elapsed since last reset.
//   - nextWaveAt is the seconds-from-start of the next wave.
//   - First wave: nextWaveAt = pve.firstWaveAfterSec at init.
//   - On wave fire: nextWaveAt += pve.waveIntervalSec, raidAnnounced reset.
//   - At (nextWaveAt - announceLeadSec): emit raid-incoming once.
//
// All math goes through the seconds-since-start scalar so we never compare
// floats accumulated across many ticks.

import { TICK_DT } from '../../core/game-loop.js';
import { emit } from '../../core/events.js';

export function updatePVE(dt, deps) {
  const { state, config, entities, units } = deps;
  if (!config.pve?.enabled) return;

  state.pve.waveTimer += dt;

  const announceAt = state.pve.nextWaveAt - config.pve.announceLeadSec;
  if (!state.pve.raidAnnounced && state.pve.waveTimer >= announceAt) {
    state.pve.raidAnnounced = true;
    emit(state, 'raid-incoming', Math.round(config.pve.announceLeadSec / TICK_DT), {
      inSec: Math.max(0, config.pve.announceLeadSec),
    });
  }

  if (state.pve.waveTimer >= state.pve.nextWaveAt) {
    fireWave(deps);
    state.pve.nextWaveAt += config.pve.waveIntervalSec;
    state.pve.raidAnnounced = false;
  }
}

function fireWave(deps) {
  const { state, config, entities, units, map } = deps;
  const camps = entities.buildingsOf('wild').filter((b) => b.kind === 'banditCamp' && b.hp > 0);
  if (camps.length === 0) return;

  const totalSpawned = spawnAllWaves(camps, config, entities, units, map);
  if (totalSpawned > 0) {
    emit(state, 'raid-fired', Math.round(5 / TICK_DT), { count: totalSpawned });
  }
}

function spawnAllWaves(camps, config, entities, units, map) {
  let total = 0;
  for (const camp of camps) {
    const target = nearestPlayerTownHall(camp, entities);
    for (let i = 0; i < config.pve.waveSize; i++) {
      const spot = freeSpotNear(camp, i, map);
      if (!spot) continue;
      const bandit = entities.makeUnit('bandit', 'wild', spot.x, spot.y);
      if (target) {
        const t = entities.entityCenterTile(target);
        // Path to the town hall; the melee state machine takes over from there
        // (auto-acquires anything hostile within ~4 tiles along the way).
        const ok = units.setMoveTarget(bandit, t.x, t.y);
        if (!ok) {
          // Unreachable target — fall back to a job-attack so the unit at
          // least tries to engage anything that walks past.
          bandit.job = 'attack';
          bandit.jobTargetId = target.id;
        }
      }
      total += 1;
    }
  }
  return total;
}

function nearestPlayerTownHall(camp, entities) {
  const cx = (camp.tileX + camp.w / 2) * 32;
  const cy = (camp.tileY + camp.h / 2) * 32;
  // Prefer the camp's assigned target faction so raids stay distributed across
  // players regardless of geometry. If that faction has no town hall left
  // (eliminated, or legacy save with no targetFaction), fall back to any.
  if (camp.targetFaction) {
    const t = entities.nearestOf(
      (e) => e.type === 'building' && e.kind === 'townHall'
          && e.owner === camp.targetFaction && e.hp > 0,
      cx, cy,
    );
    if (t) return t;
  }
  return entities.nearestOf(
    (e) => e.type === 'building' && e.kind === 'townHall' && e.hp > 0,
    cx, cy,
  );
}

/**
 * Walk a small spiral around the camp footprint looking for a passable tile
 * that no entity already occupies (loosely). i is the spawn index in this wave,
 * used to spread bandits around the ring rather than stacking on one tile.
 */
function freeSpotNear(camp, i, map) {
  const ring = [
    [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];
  const cx = camp.tileX + Math.floor(camp.w / 2);
  const cy = camp.tileY + Math.floor(camp.h / 2);
  for (let r = 1; r <= 3; r++) {
    const [dx, dy] = ring[(i + r) % ring.length];
    const tx = cx + dx * (1 + Math.floor(r / 2));
    const ty = cy + dy * (1 + Math.floor(r / 2));
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
    return { x: tx, y: ty };
  }
  return null;
}
