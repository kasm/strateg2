// Internal: pure-ish entity constructors. Take everything they need as parameters.
//
// Entity-to-entity references are stored as numeric IDs (suffix `Id` / `Ids`), never as
// object refs. Resolve via `entities.byId(id)` at read sites. This keeps sim state
// serializable and snapshot-friendly for future multiplayer.
//
// Neither constructor switches on `kind`: the dynamic fields a unit/building needs are
// inferred from declared def fields (`quiver`, `woodCap`, `garrisonMax`, `node`, ...),
// so a new content kind that reuses an existing capability needs no factory change.

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
    gatherResource: null,
    carrying: null,
    cooldown: 0,
    // A unit with a `quiver` def starts half-stocked; others never carry arrows.
    arrows: def.quiver ? Math.floor(def.quiver.max / 2) : 0,
    gatherTimer: 0,
    insideBuildingId: null,
  };
}

export function makeBuildingRecord(id, kind, owner, tileX, tileY, def) {
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
  // Capability-driven dynamic state — keyed off declared def fields, not `kind`.
  if (def.woodCap != null)     b.wood = 0;             // stockpiles wood (arrowBuilding)
  if (def.arrowCap != null)    b.arrows = 0;           // stockpiles arrows (arrowBuilding, tower)
  if (def.arrowTime != null)   b.arrowTimer = 0;       // converts wood -> arrows (arrowBuilding)
  if (def.garrisonMax != null) b.garrisonIds = [];     // garrisons units (tower)
  if (def.distributeTime != null) b.distributeTimer = 0; // hands arrows to garrison (tower)
  if (def.researches)          b.researchQueue = [];   // hosts research (Seam 4)
  if (def.node)                b[def.node.resource] = def.node.amount; // resource node payload (goldMine)
  return b;
}
