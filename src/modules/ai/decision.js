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

export function aiDecide(state, config, entities, map, ai, owner) {
  const enemy = owner === 'red' ? 'blue' : 'red';
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
  const deps = { state, config, map, entities, owner };
  for (const kind of ECONOMY_ORDER) {
    if (has(kind)) continue;
    const cost = config.building[kind].cost;
    if (me.gold < cost.gold || me.wood < cost.wood) continue;
    tryAIBuild(kind, ...hintFor(kind, owner), deps);
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
    const myTH = myBuildings.find(b => b.kind === 'townHall');
    const fromX = myTH ? (myTH.tileX + 1) * config.tile : 5 * config.tile;
    const fromY = myTH ? (myTH.tileY + 1) * config.tile : 10 * config.tile;
    const target = entities.nearestOf(
      e => e.type === 'building' && e.owner === enemy,
      fromX, fromY,
    );
    if (target) {
      for (const u of army) { u.job = 'attack'; u.jobTarget = target; }
      ai.waveTimer = config.ai.waveCooldown;
    }
  }
}

// Hint tiles near each owner's town hall. The findGrassSpot ring search relaxes outward,
// so these are starting points rather than required exact placements.
//   blue TH 26-28,8-10 — forests 22-26,4-6 + 23-27,14-16 — gold mine 24-25,9-10
//   red  TH  1-3,8-10 — forests  3-7,4-6 +  4-8,14-16 — gold mine  4-5,9-10
function hintFor(kind, owner) {
  if (owner === 'red') {
    switch (kind) {
      case 'arrowBuilding': return [5, 11];
      case 'barracks':      return [6, 7];
      case 'archeryRange':  return [3, 12];
      default:              return [6, 7];
    }
  }
  switch (kind) {
    case 'arrowBuilding': return [22, 11];
    case 'barracks':      return [22, 8];
    case 'archeryRange':  return [24, 12];
    default:              return [22, 8];
  }
}
