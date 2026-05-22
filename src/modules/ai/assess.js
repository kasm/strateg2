// Internal: the perception layer shared by the complex AIs (adaptive / utility / hybrid).
//
// `assess()` builds one immutable read-only snapshot of the battlefield from the owner's
// point of view, computed once per decide tick. Every macro/micro layer reads this
// snapshot instead of re-querying entities — keeping the deciders cheap and consistent.
// There is no fog of war, so the snapshot has full information (like a human player).

/**
 * Combat power of a single army unit: damage-per-second scaled by remaining HP.
 * Archers with an empty quiver are nearly worthless until resupplied.
 */
export function unitPower(u, config) {
  const def = config.unit[u.kind];
  if (!def) return 0;
  let p = (def.dmg / def.cooldown) * (0.35 + 0.65 * (u.hp / u.maxHp));
  if (u.kind === 'archer' && u.arrows <= 0) p *= 0.35;
  return p;
}

/** Total combat power of a list of army units (peasants excluded). */
function armyPower(units, config) {
  let p = 0;
  for (const u of units) {
    if (u.kind === 'swordsman' || u.kind === 'archer') p += unitPower(u, config);
  }
  return p;
}

/**
 * @returns {Object} snapshot — see field comments below.
 */
export function assess(state, config, entities, map, owner) {
  const enemy = owner === 'red' ? 'blue' : 'red';
  const me = state.players[owner];

  const myUnits     = entities.unitsOf(owner);
  const myBuildings = entities.buildingsOf(owner);
  const enemyUnits  = entities.unitsOf(enemy);
  const enemyBuildings = entities.buildingsOf(enemy);

  const peasants   = myUnits.filter(u => u.kind === 'peasant');
  const swordsmen  = myUnits.filter(u => u.kind === 'swordsman');
  const archers    = myUnits.filter(u => u.kind === 'archer');
  const army       = myUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');
  // "Field" army = army units not garrisoned inside a tower (the ones we can manoeuvre).
  const fieldArmy  = army.filter(u => u.insideBuildingId == null);
  const idlePeasants = peasants.filter(p => !p.job && p.insideBuildingId == null);
  const gatherers  = peasants.filter(p => p.job === 'gather');

  const enemySwordsmen = enemyUnits.filter(u => u.kind === 'swordsman');
  const enemyArchers   = enemyUnits.filter(u => u.kind === 'archer');
  const enemyArmy      = enemyUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');

  const buildingKinds = new Set(myBuildings.map(b => b.kind));
  const count = kind => myBuildings.filter(b => b.kind === kind).length;

  const townHall = myBuildings.find(b => b.kind === 'townHall');
  const thCx = townHall ? (townHall.tileX + townHall.w / 2) * config.tile : config.mapW * config.tile / 2;
  const thCy = townHall ? (townHall.tileY + townHall.h / 2) * config.tile : config.mapH * config.tile / 2;

  // Threat: the enemy unit (army first, else any) closest to my Town Hall.
  let threatUnit = null, threatDist = Infinity;
  for (const u of enemyArmy.length ? enemyArmy : enemyUnits) {
    const d = Math.hypot(u.x - thCx, u.y - thCy);
    if (d < threatDist) { threatDist = d; threatUnit = u; }
  }

  return {
    owner, enemy,
    gold: me.gold, wood: me.wood,

    myUnits, myBuildings, enemyUnits, enemyBuildings,
    peasants, swordsmen, archers, army, fieldArmy, idlePeasants, gatherers,
    enemySwordsmen, enemyArchers, enemyArmy,

    townHall, thCx, thCy,
    has: kind => buildingKinds.has(kind),
    count,
    towerCount: count('tower'),

    myPower:    armyPower(army, config),
    enemyPower: armyPower(enemyArmy, config),
    enemyTowers: enemyBuildings.filter(b => b.kind === 'tower').length,

    threatUnit,
    threatDist,                                  // pixels; Infinity if no enemy units
    threatTiles: threatDist / config.tile,       // tiles
  };
}
