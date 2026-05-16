// Internal: pure-ish entity constructors. Take everything they need as parameters.

export function makeUnitRecord(id, kind, owner, tileX, tileY, def, tileSize) {
  const cx = tileX * tileSize + tileSize / 2;
  const cy = tileY * tileSize + tileSize / 2;
  return {
    id,
    type: 'unit',
    kind,
    owner,
    tileX, tileY,
    x: cx, y: cy,
    hp: def.hp,
    maxHp: def.hp,
    state: 'idle',
    path: null,
    target: null,
    job: null,
    jobTarget: null,
    carrying: null,
    cooldown: 0,
    arrows: 0,
    gatherTimer: 0,
    insideBuilding: null,
  };
}

export function makeBuildingRecord(id, kind, owner, tileX, tileY, def, config) {
  const b = {
    id,
    type: 'building',
    kind,
    owner,
    tileX, tileY,
    w: def.w,
    h: def.h,
    hp: def.hp,
    maxHp: def.hp,
    trainQueue: [],
    trainTimer: 0,
  };
  if (kind === 'arrowBuilding') {
    b.wood = 0;
    b.arrows = 0;
    b.arrowTimer = 0;
  }
  if (kind === 'goldMine') {
    b.gold = config.resources.goldPerMine;
  }
  if (kind === 'tower') {
    b.garrison = [];
  }
  return b;
}
