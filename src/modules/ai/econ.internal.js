// Internal: shared MACRO primitives for the complex AIs (adaptive / utility / hybrid).
//
// Each primitive takes a mutable `budget` ({gold, wood}) seeded from the player's
// treasury and decrements it as it submits commands. This is the same shadow-budget
// trick the att/def deciders use inline: it mirrors the projected post-drain state so
// a single decide pass never over-commits gold or wood it does not have.
//
// Like all AI code these never mutate sim state — they only submit commands.

import { findGrassSpot, buildHint } from './build-order.internal.js';
import { assignIdlePeasants } from './common.internal.js';

/** Assign idle peasants to gathering. Wraps the shared common.js helper. */
export function assignEconomy(deps, snap, { woodBias = false, maxGatherers = Infinity } = {}) {
  const { entities, map, commands, owner } = deps;
  assignIdlePeasants(entities, map, commands, owner, { woodBias, maxGatherers });
}

/** Can `budget` afford building `kind`? */
function affords(config, budget, kind) {
  const cost = config.building[kind].cost;
  return cost && budget.gold >= cost.gold && budget.wood >= cost.wood;
}

/**
 * Place one building of `kind` near its hint tile. Returns true if a build command
 * was submitted (and `budget` debited). Caller checks affordability / desire first.
 */
export function buildOne(deps, snap, budget, kind) {
  const { config, map, commands, owner } = deps;
  if (!affords(config, budget, kind)) return false;
  const [hx, hy] = buildHint(kind, owner);
  let spot = findGrassSpot(kind, hx, hy, 10, map);
  if (!spot && snap.townHall) {
    spot = findGrassSpot(kind, snap.townHall.tileX + 1, snap.townHall.tileY + 1, 14, map);
  }
  if (!spot) return false;
  commands.submit({ type: 'build', playerId: owner, kind, tileX: spot.x, tileY: spot.y });
  const cost = config.building[kind].cost;
  budget.gold -= cost.gold;
  budget.wood -= cost.wood;
  return true;
}

/**
 * Build every still-missing building in `order` that the budget can afford, in order.
 * Independent branches — a flush pass can place several at once (like the att AI).
 */
export function buildNext(deps, snap, budget, order) {
  for (const kind of order) {
    if (snap.has(kind)) continue;
    buildOne(deps, snap, budget, kind);
  }
}

/** Build towers until `target` are present (counting any already placed this pass is the caller's job). */
export function buildTowers(deps, snap, budget, target) {
  let have = snap.towerCount;
  while (have < target && affords(deps.config, budget, 'tower')) {
    if (!buildOne(deps, snap, budget, 'tower')) break;
    have++;
  }
}

/**
 * Peasant trickle. Trains one peasant when below `minPeasants`, the Town Hall queue
 * has room, and the budget still covers `reserveGold` (gold earmarked for the next
 * building) on top of the peasant cost.
 */
export function trainPeasants(deps, snap, budget, { minPeasants, reserveGold = 0 }) {
  const { config, commands, owner } = deps;
  const th = snap.townHall;
  if (!th || snap.peasants.length >= minPeasants || th.trainQueue.length >= 2) return;
  const cost = config.unit.peasant.cost.gold;
  if (budget.gold < cost + reserveGold) return;
  commands.submit({ type: 'train', playerId: owner, buildingId: th.id, unitKind: 'peasant' });
  budget.gold -= cost;
}

/**
 * Train combat units at each combat building (queue cap 2). `prefer` ('swordsman' |
 * 'archer' | 'both') decides which building is funded first when gold is tight.
 */
export function trainArmy(deps, snap, budget, prefer = 'both') {
  const { config, commands, owner } = deps;
  const slots = [];
  const barracks = snap.myBuildings.find(b => b.kind === 'barracks');
  const range    = snap.myBuildings.find(b => b.kind === 'archeryRange');
  if (barracks) slots.push({ b: barracks, kind: 'swordsman' });
  if (range)    slots.push({ b: range,    kind: 'archer' });
  // Preferred unit first so it gets funded when the budget can only cover one.
  if (prefer !== 'both') slots.sort((a, z) => (a.kind === prefer ? -1 : z.kind === prefer ? 1 : 0));

  for (const { b, kind } of slots) {
    if (b.trainQueue.length >= 2) continue;
    const cost = config.unit[kind].cost.gold;
    if (budget.gold < cost) continue;
    commands.submit({ type: 'train', playerId: owner, buildingId: b.id, unitKind: kind });
    budget.gold -= cost;
  }
}
