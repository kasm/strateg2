// PUBLIC API of the entities module.
// Owns entity construction, queries over the entity list, and removal.
//
// Maintains `state.entitiesById` as a Map<id, entity> kept in sync with `state.entities`.
// `byId(id)` is the only sanctioned way to resolve a stored entity-ref ID.

import { makeUnitRecord, makeBuildingRecord } from './factory.js';
import { findEntityAtPx, nearestEntity, entitiesOfKindOwner } from './queries.js';
import { ejectAllFromTower } from '../units/archer.js';

/**
 * @typedef {Object} EntitiesModule
 * @property {(kind:string, owner:string, tileX:number, tileY:number) => Object} makeUnit
 *   Construct a unit; pushes it into state.entities and returns it.
 * @property {(kind:string, owner:string, tileX:number, tileY:number) => Object} makeBuilding
 *   Construct a building, mark its footprint on the map, push it, return it.
 * @property {() => void} spawnInitial
 *   Seed the standard starting setup (gold mines, town halls, 3 peasants/side).
 * @property {(px:number, py:number) => Object|null} findEntityAt
 * @property {(owner:string) => Object[]} unitsOf
 * @property {(owner:string) => Object[]} buildingsOf
 * @property {(filter:(e:Object)=>boolean, fromX:number, fromY:number) => Object|null} nearestOf
 * @property {(id:number|null|undefined) => Object|null} byId
 * @property {(e:Object) => void} killEntity
 * @property {() => void} pruneDead
 * @property {(e:Object) => {x:number,y:number}} entityCenterTile
 */

/**
 * @param {{
 *   state:  import('../../core/game-state.js').GameState,
 *   config: import('../../core/config.js').GameConfig,
 *   map:    import('../map/index.js').MapModule,
 * }} deps
 * @returns {EntitiesModule}
 */
export function createEntities({ state, config, map, pathfinding }) {
  function byId(id) {
    if (id == null) return null;
    return state.entitiesById.get(id) || null;
  }

  function makeUnit(kind, owner, tileX, tileY) {
    const def = config.unit[kind];
    const u = makeUnitRecord(state._nextId++, kind, owner, tileX, tileY, def, config.tile);
    state.entities.push(u);
    state.entitiesById.set(u.id, u);
    return u;
  }

  function makeBuilding(kind, owner, tileX, tileY) {
    const def = config.building[kind];
    const b = makeBuildingRecord(state._nextId++, kind, owner, tileX, tileY, def, config);
    map.setBuildingTiles(b, true);
    state.entities.push(b);
    state.entitiesById.set(b.id, b);
    return b;
  }

  function spawnInitial() {
    map.reset();
    state.entities.length = 0;
    state.entitiesById.clear();
    state.projectiles.length = 0;
    state.gameOver = null;
    state.tick = 0;
    state.players.red.gold  = config.startResources.gold;
    state.players.red.wood  = config.startResources.wood;
    state.players.blue.gold = config.startResources.gold;
    state.players.blue.wood = config.startResources.wood;

    makeBuilding('goldMine', 'neutral', 4, 9);
    makeBuilding('goldMine', 'neutral', config.mapW - 6, 9);
    makeBuilding('townHall', 'red', 1, 8);
    makeBuilding('townHall', 'blue', config.mapW - 4, 8);
    for (let i = 0; i < 3; i++) {
      makeUnit('peasant', 'red', 5 + i, 11);
      makeUnit('peasant', 'blue', config.mapW - 6 - i, 11);
    }
  }

  function killEntity(e) {
    if (e.type === 'building') {
      if (e.kind === 'tower' && e.garrisonIds && e.garrisonIds.length > 0) {
        map.setBuildingTiles(e, false);
        ejectAllFromTower(e, { state, config, map, pathfinding, entities: api });
      } else {
        map.setBuildingTiles(e, false);
      }
    }
    e.hp = 0;
    e.state = 'dead';
    // Selection is client-local; selected list is filtered against live entities at read time.
  }

  function pruneDead() {
    for (let i = state.entities.length - 1; i >= 0; i--) {
      const e = state.entities[i];
      if (e.hp <= 0) {
        state.entitiesById.delete(e.id);
        state.entities.splice(i, 1);
      }
    }
  }

  function entityCenterTile(e) {
    if (e.type === 'building') {
      return { x: e.tileX + Math.floor(e.w / 2), y: e.tileY + Math.floor(e.h / 2) };
    }
    return { x: e.tileX, y: e.tileY };
  }

  const api = {
    makeUnit, makeBuilding, spawnInitial,
    findEntityAt: (px, py) => findEntityAtPx(state.entities, px, py, config.tile),
    unitsOf:      (owner)   => entitiesOfKindOwner(state.entities, 'unit', owner),
    buildingsOf:  (owner)   => entitiesOfKindOwner(state.entities, 'building', owner),
    nearestOf:    (filter, fromX, fromY) => nearestEntity(state.entities, filter, fromX, fromY, config.tile),
    byId,
    killEntity, pruneDead, entityCenterTile,
  };
  return api;
}
