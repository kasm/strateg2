// Internal: pure-ish entity constructors. Take everything they need as parameters.
//
// Entity-to-entity references are stored as numeric IDs (suffix `Id` / `Ids`), never as
// object refs. Resolve via `entities.byId(id)` at read sites. This keeps sim state
// serializable and snapshot-friendly for future multiplayer.

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
    targetId: null,
    job: null,
    jobTargetId: null,
    targetTile: null,
    carrying: null,
    cooldown: 0,
    arrows: kind === 'archer' ? Math.floor(def.quiverMax / 2) : 0,
    gatherTimer: 0,
    insideBuildingId: null,
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
    b.garrisonIds = [];
    b.arrows = 0;
    b.distributeTimer = 0;
  }
  return b;
}
