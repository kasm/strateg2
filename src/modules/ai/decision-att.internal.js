// Internal: the "Att AI" decision pass — an attacking economy AI. Priorities:
//   1. Keep peasants assigned to gold/wood gathering; bias toward wood while arrowBuilding pending.
//   2. Build economy in priority order: arrowBuilding -> barracks -> archeryRange -> tower.
//      Each is independent so multiple can land in one tick if affordable.
//   3. Train more peasants up to ai.minPeasants — but only when the next pending
//      economy building is comfortably afforded, so the trickle doesn't starve the build order.
//   4. Train one combat unit at each combat building when affordable.
//   4b. Auto-garrison idle archers into nearest tower with room.
//   5. Once army >= ai.armyThreshold and waveCooldown elapsed, attack-move at the nearest enemy building.
//
// The AI never mutates simulation state — every decision is submitted as a command and
// applied at the start of the next tick. A local resource budget (`goldBudget`/`woodBudget`)
// and shadow trainQueue counter mirror the projected post-drain state so the AI never
// over-commits inside a single decide pass.

import { findGrassSpot } from './build-order.internal.js';
import { assignIdlePeasants, garrisonIdleArchers } from './common.internal.js';

const ECONOMY_ORDER = ['arrowBuilding', 'barracks', 'archeryRange', 'tower'];

export function aiDecideAtt(state, config, entities, map, commands, ai, owner) {
  const enemy = owner === 'red' ? 'blue' : 'red';
  const me = state.players[owner];
  const myUnits     = entities.unitsOf(owner);
  const myBuildings = entities.buildingsOf(owner);
  const peasants    = myUnits.filter(u => u.kind === 'peasant');
  const army        = myUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');

  const has = kind => myBuildings.some(b => b.kind === kind);
  const townHall = myBuildings.find(b => b.kind === 'townHall');
  const pendingEconomy = ECONOMY_ORDER.find(k => !has(k));

  let goldBudget = me.gold;
  let woodBudget = me.wood;
  // Shadow per-building trainQueue lengths so multi-train caps survive within one pass.
  const queueLen = b => b.trainQueue.length;
  let thQueue = townHall ? queueLen(townHall) : 0;

  // 1. Assign idle peasants. Bias to wood while arrowBuilding is pending and wood is thin.
  assignIdlePeasants(entities, map, commands, owner, {
    woodBias: !has('arrowBuilding') && me.wood < 200,
  });

  // 2. Build economy. Independent branches so a flush tick can place more than one.
  for (const kind of ECONOMY_ORDER) {
    if (has(kind)) continue;
    const cost = config.building[kind].cost;
    if (goldBudget < cost.gold || woodBudget < cost.wood) continue;
    const [hx, hy] = hintFor(kind, owner);
    let spot = findGrassSpot(kind, hx, hy, 10, map);
    if (!spot && townHall) spot = findGrassSpot(kind, townHall.tileX + 1, townHall.tileY + 1, 14, map);
    if (!spot) continue;
    commands.submit({
      type: 'build', playerId: owner, kind, tileX: spot.x, tileY: spot.y,
    });
    goldBudget -= cost.gold;
    woodBudget -= cost.wood;
  }

  // 3. Peasant trickle — gated so we don't drain gold needed for the next building.
  if (townHall && peasants.length < config.ai.minPeasants && thQueue < 2) {
    const peasantCost = config.unit.peasant.cost.gold;
    const reserve = pendingEconomy ? config.building[pendingEconomy].cost.gold + 50 : 0;
    if (goldBudget >= peasantCost + reserve) {
      commands.submit({
        type: 'train', playerId: owner, buildingId: townHall.id, unitKind: 'peasant',
      });
      goldBudget -= peasantCost;
      thQueue++;
    }
  }

  // 4. Train combat units at each combat building.
  const barracks = myBuildings.find(b => b.kind === 'barracks');
  if (barracks && queueLen(barracks) < 2 && goldBudget >= config.unit.swordsman.cost.gold) {
    commands.submit({
      type: 'train', playerId: owner, buildingId: barracks.id, unitKind: 'swordsman',
    });
    goldBudget -= config.unit.swordsman.cost.gold;
  }
  const range = myBuildings.find(b => b.kind === 'archeryRange');
  if (range && queueLen(range) < 2 && goldBudget >= config.unit.archer.cost.gold) {
    commands.submit({
      type: 'train', playerId: owner, buildingId: range.id, unitKind: 'archer',
    });
    goldBudget -= config.unit.archer.cost.gold;
  }

  // 4b. Auto-garrison idle archers into nearest tower with room.
  garrisonIdleArchers(config, entities, commands, owner);

  // 5. Wave attack.
  if (ai.waveTimer <= 0 && army.length >= config.ai.armyThreshold) {
    const fromX = townHall ? (townHall.tileX + 1) * config.tile : 5 * config.tile;
    const fromY = townHall ? (townHall.tileY + 1) * config.tile : 10 * config.tile;
    const target = entities.nearestOf(
      e => e.type === 'building' && e.owner === enemy,
      fromX, fromY,
    );
    if (target) {
      commands.submit({
        type: 'order', playerId: owner,
        unitIds: army.map(u => u.id),
        target: { kind: 'entity', id: target.id },
      });
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
      case 'tower':         return [10, 9];
      default:              return [6, 7];
    }
  }
  switch (kind) {
    case 'arrowBuilding': return [34, 11];
    case 'barracks':      return [34, 8];
    case 'archeryRange':  return [36, 12];
    case 'tower':         return [30, 9];
    default:              return [34, 8];
  }
}
