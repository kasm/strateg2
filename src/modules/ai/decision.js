// Internal: the blue player's once-per-`decideEvery` decision pass.
// Priorities (top to bottom):
//   1. Keep peasants assigned to gold/wood gathering, balanced ~50/50.
//   2. Train more peasants up to ai.minPeasants.
//   3. Build economy: arrowBuilding -> barracks -> archeryRange (in that order).
//   4. Train one combat unit at each combat building when affordable.
//   5. Once army >= ai.armyThreshold and waveCooldown elapsed, attack-move at the nearest red building.

import { tryAIBuild } from './build-order.js';

export function aiDecide(state, config, entities, map, ai) {
  const owner = 'blue';
  const me = state.players[owner];
  const myUnits     = entities.unitsOf(owner);
  const myBuildings = entities.buildingsOf(owner);
  const peasants    = myUnits.filter(u => u.kind === 'peasant');
  const army        = myUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');

  // 1. Assign idle peasants to whichever gather job is currently under-staffed.
  let goldCount = peasants.filter(p => p.job === 'gatherGold').length;
  let woodCount = peasants.filter(p => p.job === 'gatherWood').length;
  for (const p of peasants) {
    if (p.job) continue;
    if (goldCount <= woodCount) { p.job = 'gatherGold'; goldCount++; }
    else                        { p.job = 'gatherWood'; woodCount++; }
  }

  const has = kind => myBuildings.some(b => b.kind === kind);
  const townHall = myBuildings.find(b => b.kind === 'townHall');

  // 2. Peasant trickle.
  if (townHall && peasants.length < config.ai.minPeasants && townHall.trainQueue.length < 2) {
    if (me.gold >= config.unit.peasant.cost.gold) {
      me.gold -= config.unit.peasant.cost.gold;
      townHall.trainQueue.push('peasant');
    }
  }

  // 3. Build economy in priority order.
  const deps = { state, config, map, entities };
  if (!has('arrowBuilding') && me.gold >= 100 && me.wood >= 150) {
    tryAIBuild('arrowBuilding', 22, 6, deps);
  } else if (!has('barracks') && me.gold >= 200 && me.wood >= 100) {
    tryAIBuild('barracks', 22, 13, deps);
  } else if (!has('archeryRange') && me.gold >= 200 && me.wood >= 100) {
    tryAIBuild('archeryRange', 25, 13, deps);
  }

  // 4. Train combat units at each combat building.
  const barracks = myBuildings.find(b => b.kind === 'barracks');
  if (barracks && barracks.trainQueue.length < 2 && me.gold >= config.unit.swordsman.cost.gold) {
    me.gold -= config.unit.swordsman.cost.gold;
    barracks.trainQueue.push('swordsman');
  }
  const range = myBuildings.find(b => b.kind === 'archeryRange');
  if (range && range.trainQueue.length < 2 && me.gold >= config.unit.archer.cost.gold) {
    me.gold -= config.unit.archer.cost.gold;
    range.trainQueue.push('archer');
  }

  // 5. Wave attack.
  if (ai.waveTimer <= 0 && army.length >= config.ai.armyThreshold) {
    const target = entities.nearestOf(
      e => e.type === 'building' && e.owner === 'red',
      5 * config.tile, 10 * config.tile,
    );
    if (target) {
      for (const u of army) { u.job = 'attack'; u.jobTarget = target; }
      ai.waveTimer = config.ai.waveCooldown;
    }
  }
}
