// Internal: the blue player's once-per-`decideEvery` decision pass.
// Priorities (top to bottom):
//   1. Keep peasants assigned to gold/wood gathering; bias toward wood while arrowBuilding pending.
//   2. Build economy in priority order: arrowBuilding -> barracks -> archeryRange.
//      Each is independent so multiple can land in one tick if affordable.
//   3. Train more peasants up to ai.minPeasants — but only when the next pending
//      economy building is comfortably afforded, so the trickle doesn't starve the build order.
//   4. Train one combat unit at each combat building when affordable.
//   5. Once army >= ai.armyThreshold and waveCooldown elapsed, attack-move at the nearest red building.

import { tryAIBuild } from './build-order.js';

const ECONOMY_ORDER = ['arrowBuilding', 'barracks', 'archeryRange'];

export function aiDecide(state, config, entities, map, ai) {
  const owner = 'blue';
  const me = state.players[owner];
  const myUnits     = entities.unitsOf(owner);
  const myBuildings = entities.buildingsOf(owner);
  const peasants    = myUnits.filter(u => u.kind === 'peasant');
  const army        = myUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');

  const has = kind => myBuildings.some(b => b.kind === kind);
  const townHall = myBuildings.find(b => b.kind === 'townHall');
  const pendingEconomy = ECONOMY_ORDER.find(k => !has(k));

  // 1. Assign idle peasants. Bias to wood while arrowBuilding (150 wood) is still pending and
  //    wood stockpile is thin; otherwise keep the 50/50 balance.
  let goldCount = peasants.filter(p => p.job === 'gatherGold').length;
  let woodCount = peasants.filter(p => p.job === 'gatherWood').length;
  const woodBias = !has('arrowBuilding') && me.wood < 200;
  for (const p of peasants) {
    if (p.job) continue;
    const preferWood = woodBias ? woodCount < goldCount + 2 : woodCount < goldCount;
    if (preferWood) { p.job = 'gatherWood'; woodCount++; }
    else            { p.job = 'gatherGold'; goldCount++; }
  }

  // 2. Build economy. Independent branches so a flush tick can place more than one.
  const deps = { state, config, map, entities };
  for (const kind of ECONOMY_ORDER) {
    if (has(kind)) continue;
    const cost = config.building[kind].cost;
    if (me.gold < cost.gold || me.wood < cost.wood) continue;
    tryAIBuild(kind, ...hintFor(kind), deps);
  }

  // 3. Peasant trickle — gated so we don't drain gold needed for the next building.
  if (townHall && peasants.length < config.ai.minPeasants && townHall.trainQueue.length < 2) {
    const peasantCost = config.unit.peasant.cost.gold;
    const reserve = pendingEconomy ? config.building[pendingEconomy].cost.gold + 50 : 0;
    if (me.gold >= peasantCost + reserve) {
      me.gold -= peasantCost;
      townHall.trainQueue.push('peasant');
    }
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

// Hint tiles next to blue's town hall (TH at 26-28, 8-10; forests at 22-26,4-6 and 23-27,14-16;
// gold mine at 24-25, 9-10). All chosen to be on grass so placement succeeds at radius 0.
function hintFor(kind) {
  switch (kind) {
    case 'arrowBuilding': return [22, 11];
    case 'barracks':      return [22, 8];
    case 'archeryRange':  return [24, 12];
    default:              return [22, 8];
  }
}
