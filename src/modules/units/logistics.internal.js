// Internal: peasant gather + haul state machines.
// Each `do*` advances one tick of a multi-stage cycle: travel -> work -> travel-back -> deposit.
//
// Entity-to-entity refs are stored as IDs (u.jobTargetId, u.targetId, u.insideBuildingId);
// resolve them via entities.byId() at the top of each function and work with the resolved
// objects locally.

import { setMoveTarget, moveAdjacentTo, moveAlongPath } from './movement.internal.js';

export function tryAutoLogistics(u, { state, config, entities }) {
  // Idle peasants self-assign to whichever logistics task is needed near them.
  const ab = entities.nearestOf(
    e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner,
    u.x, u.y,
  );
  if (!ab) return;
  const abDef = config.building.arrowBuilding;
  const woodDeficit = abDef.woodCap - ab.wood;
  const haveWood = state.players[u.owner].wood > 0;
  const consumer = findArrowConsumer(u, config, entities);
  const hasArrowJob = ab.arrows > 0 && consumer != null;
  const hasWoodJob  = woodDeficit > 0 && haveWood;

  const assignArrows = () => {
    u.job = 'haulArrows';
    u.jobTargetId = consumer.id;
    u.targetId    = ab.id;
  };
  const assignWood = () => {
    u.job = 'haulWood';
    u.jobTargetId = ab.id;
  };

  const pri = state.supplyPriority || 'auto';
  if (pri === 'wood') {
    if (hasWoodJob) return assignWood();
    if (hasArrowJob) return assignArrows();
    return;
  }
  if (pri === 'arrows') {
    if (hasArrowJob) return assignArrows();
    if (hasWoodJob) return assignWood();
    return;
  }
  // 'auto' — arrows beat wood when both available (original behavior).
  if (hasArrowJob) return assignArrows();
  if (hasWoodJob) return assignWood();
}

function findArrowConsumer(u, config, entities) {
  // Closest of: non-garrisoned archer below quiverMax, OR garrisoned tower below arrowCap.
  return entities.nearestOf(
    e => {
      if (e.owner !== u.owner) return false;
      if (e.type === 'unit') {
        return e.kind === 'archer' && e.arrows < config.unit.archer.quiver.max;
      }
      if (e.type === 'building' && e.kind === 'tower') {
        return e.garrisonIds.length > 0 && e.arrows < config.building.tower.arrowCap;
      }
      return false;
    },
    u.x, u.y,
  );
}

// Generic gather: the resource being gathered is on `u.gatherResource`; where it
// comes from is resolved from config.resourceTypes[resource].source — a building
// `node` (e.g. gold mine) or a map `tile` type (e.g. forest). Adding a resource is
// pure config; no branch here is keyed to gold or wood.
export function doGather(u, dt, deps) {
  const { state, config, entities } = deps;
  const resource = u.gatherResource;
  if (!resource) { u.job = null; return; }

  if (u.carrying && u.carrying.kind === resource && u.carrying.amount > 0) {
    // Return to town hall to deposit.
    const th = entities.nearestOf(
      e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner,
      u.x, u.y,
    );
    if (!th) { u.job = null; return; }
    const insideX = u.tileX >= th.tileX && u.tileX < th.tileX + th.w;
    const insideY = u.tileY >= th.tileY && u.tileY < th.tileY + th.h;
    const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
    if (adj && !(insideX && insideY)) {
      state.players[u.owner][resource] += u.carrying.amount;
      u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, th, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  const src = config.resourceTypes[resource]?.source;
  if (!src) { u.job = null; return; }
  if (src.kind === 'node') gatherFromNode(u, dt, resource, deps);
  else gatherFromTile(u, dt, resource, deps);
}

// Gather from a building node — any building whose def carries a matching `node`.
function gatherFromNode(u, dt, resource, deps) {
  const { config, entities } = deps;
  const isNode = (e) => e.type === 'building'
    && config.building[e.kind]?.node?.resource === resource && (e[resource] || 0) > 0;
  let mine = entities.byId(u.jobTargetId);
  if (!mine || mine.hp <= 0 || !isNode(mine)) {
    mine = entities.nearestOf(isNode, u.x, u.y);
    u.jobTargetId = mine ? mine.id : null;
  }
  if (!mine) { u.job = null; return; }
  const insideX = u.tileX >= mine.tileX && u.tileX < mine.tileX + mine.w;
  const insideY = u.tileY >= mine.tileY && u.tileY < mine.tileY + mine.h;
  // Adjacent = within one tile of any side of the building footprint (works for w/h > 1).
  const adj = u.tileX >= mine.tileX - 1 && u.tileX <= mine.tileX + mine.w &&
              u.tileY >= mine.tileY - 1 && u.tileY <= mine.tileY + mine.h;
  if (adj && !(insideX && insideY)) {
    u.gatherTimer += dt;
    if (u.gatherTimer >= config.resources.gatherTime) {
      u.gatherTimer = 0;
      const amount = Math.min(config.resources.gatherAmount, mine[resource]);
      mine[resource] -= amount;
      u.carrying = { kind: resource, amount };
      if (mine[resource] <= 0) entities.killEntity(mine);
    }
    return;
  }
  if (!u.path || u.path.length === 0) {
    if (!moveAdjacentTo(u, mine, deps)) { u.job = null; }
  }
  moveAlongPath(u, dt, deps);
}

// Gather from a map tile — any tile carrying a matching `resource`.
function gatherFromTile(u, dt, resource, deps) {
  const { config, map, pathfinding } = deps;
  let tile = u.targetTile;
  const inv = (t) => !t || t.resource !== resource || t.amount <= 0;
  if (!tile || inv(map.tileAt(tile.x, tile.y))) {
    tile = map.findNearestResourceTile(resource, u.x, u.y);
    u.targetTile = tile;
  }
  if (!tile) { u.job = null; return; }
  const adj = Math.abs(u.tileX - tile.x) <= 1 &&
              Math.abs(u.tileY - tile.y) <= 1 &&
              !(u.tileX === tile.x && u.tileY === tile.y);
  if (adj) {
    u.gatherTimer += dt;
    if (u.gatherTimer >= config.resources.gatherTime) {
      u.gatherTimer = 0;
      const t = map.tileAt(tile.x, tile.y);
      const amount = Math.min(config.resources.gatherAmount, t.amount);
      t.amount -= amount;
      u.carrying = { kind: resource, amount };
      if (t.amount <= 0) { t.type = 'grass'; t.resource = null; t.amount = 0; u.targetTile = null; }
    }
    return;
  }
  if (!u.path || u.path.length === 0) {
    const spot = pathfinding.findAdjacentWalkable(tile.x, tile.y, 1, 1, u.tileX, u.tileY);
    if (!spot) { u.job = null; return; }
    setMoveTarget(u, spot.x, spot.y, deps);
  }
  moveAlongPath(u, dt, deps);
}

export function doHaulWood(u, dt, deps) {
  const { state, config, entities } = deps;
  const ab = entities.byId(u.jobTargetId);
  if (!ab || ab.hp <= 0) { u.job = null; u.jobTargetId = null; return; }
  const def = config.building.arrowBuilding;
  if (ab.wood >= def.woodCap) { u.job = null; u.jobTargetId = null; return; }

  if (u.carrying && u.carrying.kind === 'wood') {
    const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 &&
                Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
    if (adj) {
      const space = def.woodCap - ab.wood;
      const give = Math.min(space, u.carrying.amount);
      ab.wood += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  // Pick wood up at the town hall stockpile.
  if (state.players[u.owner].wood <= 0) { u.job = null; u.jobTargetId = null; return; }
  const th = entities.nearestOf(
    e => e.type === 'building' && e.kind === 'townHall' && e.owner === u.owner,
    u.x, u.y,
  );
  if (!th) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (th.tileX + 1)) <= 2 && Math.abs(u.tileY - (th.tileY + 1)) <= 2;
  if (adj) {
    const take = Math.min(config.unit.peasant.carry, state.players[u.owner].wood, def.woodCap - ab.wood);
    state.players[u.owner].wood -= take;
    u.carrying = { kind: 'wood', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, th, deps);
  moveAlongPath(u, dt, deps);
}

export function doHaulArrows(u, dt, deps) {
  const { config, entities } = deps;
  const ab = entities.byId(u.targetId);
  let consumer = entities.byId(u.jobTargetId);
  if (!ab || ab.hp <= 0) { u.job = null; return; }
  if (!consumerStillValid(consumer, u.owner, config)) {
    consumer = entities.nearestOf(
      e => isArrowConsumer(e, u.owner, config),
      u.x, u.y,
    );
    u.jobTargetId = consumer ? consumer.id : null;
    if (!consumer) { u.job = null; return; }
  }

  const cMax = consumerCap(consumer, config);

  if (u.carrying && u.carrying.kind === 'arrows') {
    if (consumerDepositAdjacent(u, consumer, config)) {
      const space = cMax - consumer.arrows;
      const give = Math.min(space, u.carrying.amount);
      consumer.arrows += give;
      u.carrying.amount -= give;
      if (u.carrying.amount <= 0) u.carrying = null;
      return;
    }
    if (!u.path || u.path.length === 0) moveAdjacentTo(u, consumer, deps);
    moveAlongPath(u, dt, deps);
    return;
  }

  if (ab.arrows <= 0) { u.job = null; return; }
  const adj = Math.abs(u.tileX - (ab.tileX + 0.5)) <= 1.5 &&
              Math.abs(u.tileY - (ab.tileY + 0.5)) <= 1.5;
  if (adj) {
    const take = Math.min(config.unit.peasant.carry, ab.arrows, cMax - consumer.arrows);
    ab.arrows -= take;
    u.carrying = { kind: 'arrows', amount: take };
    return;
  }
  if (!u.path || u.path.length === 0) moveAdjacentTo(u, ab, deps);
  moveAlongPath(u, dt, deps);
}

function isArrowConsumer(e, owner, config) {
  if (e.owner !== owner) return false;
  if (e.type === 'unit') {
    return e.kind === 'archer' && e.arrows < config.unit.archer.quiver.max;
  }
  if (e.type === 'building' && e.kind === 'tower') {
    return e.garrisonIds.length > 0 && e.arrows < config.building.tower.arrowCap;
  }
  return false;
}

function consumerStillValid(c, owner, config) {
  if (!c || c.hp <= 0 || c.owner !== owner) return false;
  if (c.type === 'unit') {
    return c.insideBuildingId == null && c.arrows < config.unit.archer.quiver.max;
  }
  if (c.type === 'building' && c.kind === 'tower') {
    return c.garrisonIds.length > 0 && c.arrows < config.building.tower.arrowCap;
  }
  return false;
}

function consumerCap(c, config) {
  return c.type === 'unit' ? config.unit.archer.quiver.max : config.building.tower.arrowCap;
}

function consumerDepositAdjacent(u, c, config) {
  if (c.type === 'unit') {
    const dist = Math.hypot(u.x - c.x, u.y - c.y);
    return dist <= config.tile * 1.5;
  }
  return Math.abs(u.tileX - (c.tileX + 0.5)) <= 1.5 &&
         Math.abs(u.tileY - (c.tileY + 0.5)) <= 1.5;
}

export function doAttack(u, dt, deps) {
  const { combat, entities } = deps;
  const tgt = entities.byId(u.jobTargetId);
  if (!tgt || tgt.hp <= 0) {
    u.job = null; u.jobTargetId = null; u.state = 'idle';
    return;
  }
  if (u.kind === 'archer') { combat.archerAttack(u, tgt, dt); return; }
  combat.meleeAttack(u, tgt, dt);
}
