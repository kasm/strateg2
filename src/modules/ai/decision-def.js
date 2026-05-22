// Internal: the "Def AI" decision pass — a defensive, turtle AI. Priorities:
//   1. Keep peasants gathering, but cap the gatherer count once an Arrow Building
//      exists so spare peasants stay idle and auto-logistics uses them as arrow haulers.
//   2. Build a defensive economy: arrowBuilding -> archeryRange -> N towers
//      (config.ai.def.towerTarget). No Barracks — archers only.
//   3. Trickle peasants up to config.ai.def.minPeasants (gatherers + haulers).
//   4. Train archers at the Archery Range (queue cap 2).
//   5. Counter-attack: if an enemy unit enters our territory (within threatRadius of
//      the Town Hall), send every un-garrisoned archer to attack-move it. We never
//      march on the enemy base.
//   6. Garrison any still-idle archers into towers. Towers fire with 1.5x range /
//      2x damage, so garrisoned archers are left alone even when a threat appears.
//
// Like the Att AI, this never mutates sim state — every decision is a submitted command.
// A local resource budget mirrors the projected post-drain state within one pass.

import { findGrassSpot } from './build-order.js';
import { assignIdlePeasants, garrisonIdleArchers } from './common.js';

export function aiDecideDef(state, config, entities, map, commands, ai, owner) {
  const enemy = owner === 'red' ? 'blue' : 'red';
  const me = state.players[owner];
  const def = config.ai.def;
  const myUnits     = entities.unitsOf(owner);
  const myBuildings = entities.buildingsOf(owner);
  const peasants    = myUnits.filter(u => u.kind === 'peasant');

  const has = kind => myBuildings.some(b => b.kind === kind);
  const townHall = myBuildings.find(b => b.kind === 'townHall');
  let towerCount = myBuildings.filter(b => b.kind === 'tower').length;

  let goldBudget = me.gold;
  let woodBudget = me.wood;
  const queueLen = b => b.trainQueue.length;

  // 1. Assign idle peasants. Once an Arrow Building exists, cap gatherers so the
  //    surplus stays idle — auto-logistics then picks them up as wood/arrow haulers.
  assignIdlePeasants(config, entities, map, commands, owner, {
    woodBias: me.wood < 300,
    maxGatherers: has('arrowBuilding') ? def.maxGatherers : Infinity,
  });

  // 2. Build the defensive economy. Independent branches so a flush tick may place
  //    several; each spends from the shadow budget so we never over-commit.
  const tryBuild = (kind, hx, hy) => {
    const cost = config.building[kind].cost;
    if (goldBudget < cost.gold || woodBudget < cost.wood) return false;
    let spot = findGrassSpot(kind, hx, hy, 10, map);
    if (!spot && townHall) spot = findGrassSpot(kind, townHall.tileX + 1, townHall.tileY + 1, 14, map);
    if (!spot) return false;
    commands.submit({ type: 'build', playerId: owner, kind, tileX: spot.x, tileY: spot.y });
    goldBudget -= cost.gold;
    woodBudget -= cost.wood;
    return true;
  };

  if (!has('arrowBuilding')) {
    const [hx, hy] = owner === 'red' ? [5, 11] : [34, 11];
    tryBuild('arrowBuilding', hx, hy);
  }
  if (!has('archeryRange')) {
    const [hx, hy] = owner === 'red' ? [3, 12] : [36, 12];
    tryBuild('archeryRange', hx, hy);
  }
  if (townHall) {
    const hints = defTowerHints(owner, townHall);
    while (towerCount < def.towerTarget) {
      const [hx, hy] = hints[Math.min(towerCount, hints.length - 1)];
      if (!tryBuild('tower', hx, hy)) break;
      towerCount++;
    }
  }

  // Next pending defensive building — used to reserve gold against the peasant trickle.
  let pending = null;
  if (!has('arrowBuilding'))      pending = 'arrowBuilding';
  else if (!has('archeryRange'))  pending = 'archeryRange';
  else if (towerCount < def.towerTarget) pending = 'tower';

  // 3. Peasant trickle — gated so we don't drain gold needed for the next building.
  if (townHall && peasants.length < def.minPeasants && queueLen(townHall) < 2) {
    const peasantCost = config.unit.peasant.cost.gold;
    const reserve = pending ? config.building[pending].cost.gold + 50 : 0;
    if (goldBudget >= peasantCost + reserve) {
      commands.submit({
        type: 'train', playerId: owner, buildingId: townHall.id, unitKind: 'peasant',
      });
      goldBudget -= peasantCost;
    }
  }

  // 4. Train archers at the Archery Range.
  const range = myBuildings.find(b => b.kind === 'archeryRange');
  if (range && queueLen(range) < 2 && goldBudget >= config.unit.archer.cost.gold) {
    commands.submit({
      type: 'train', playerId: owner, buildingId: range.id, unitKind: 'archer',
    });
    goldBudget -= config.unit.archer.cost.gold;
  }

  // 5. Counter-attack — only if an enemy unit has entered our territory.
  let defenderIds = null;
  if (townHall) {
    const thCx = (townHall.tileX + townHall.w / 2) * config.tile;
    const thCy = (townHall.tileY + townHall.h / 2) * config.tile;
    const intruder = entities.nearestOf(
      e => e.type === 'unit' && e.owner === enemy,
      thCx, thCy,
    );
    if (intruder) {
      const reach = def.threatRadius * config.tile;
      const dist  = Math.hypot(intruder.x - thCx, intruder.y - thCy);
      if (dist <= reach) {
        const defenders = myUnits.filter(u => u.kind === 'archer' && u.insideBuildingId == null);
        if (defenders.length > 0) {
          commands.submit({
            type: 'order', playerId: owner,
            unitIds: defenders.map(u => u.id),
            target: { kind: 'entity', id: intruder.id },
          });
          defenderIds = new Set(defenders.map(u => u.id));
        }
      }
    }
  }

  // 6. Garrison any still-idle archers into towers (skipping counter-attack defenders).
  garrisonIdleArchers(config, entities, commands, owner, defenderIds);
}

// Hint tiles for the towers: a vertical fan a few tiles in front of the Town Hall,
// toward the enemy. findGrassSpot relaxes outward, so these are starting points.
function defTowerHints(owner, townHall) {
  const tx = owner === 'red'
    ? townHall.tileX + townHall.w + 2   // east of a red base
    : townHall.tileX - 5;               // west of a blue base
  return [
    [tx, townHall.tileY + 1],           // centered on the Town Hall
    [tx, 5],                            // north flank
    [tx, 14],                           // south flank
  ];
}
