// PUBLIC API of the entities module.
// Owns entity construction, queries over the entity list, and removal.

import { makeUnitRecord, makeBuildingRecord } from './factory.js';
import { findEntityAtPx, nearestEntity, entitiesOfKindOwner } from './queries.js';

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
export function createEntities({ state, config, map }) {
  function makeUnit(kind, owner, tileX, tileY) {
    const def = config.unit[kind];
    const u = makeUnitRecord(state._nextId++, kind, owner, tileX, tileY, def, config.tile);
    state.entities.push(u);
    return u;
  }

  function makeBuilding(kind, owner, tileX, tileY) {
    const def = config.building[kind];
    const b = makeBuildingRecord(state._nextId++, kind, owner, tileX, tileY, def, config);
    map.setBuildingTiles(b, true);
    state.entities.push(b);
    return b;
  }

  function spawnInitial() {
    map.reset();
    state.entities.length = 0;
    state.projectiles.length = 0;
    state.selected.length = 0;
    state.gameOver = null;
    state.players.red.gold  = config.startResources.gold;
    state.players.red.wood  = config.startResources.wood;
    state.players.blue.gold = config.startResources.gold;
    state.players.blue.wood = config.startResources.wood;

    makeBuilding('goldMine', 'neutral', 4, 9);
    makeBuilding('goldMine', 'neutral', 24, 9);
    makeBuilding('townHall', 'red', 1, 8);
    makeBuilding('townHall', 'blue', 26, 8);
    for (let i = 0; i < 3; i++) {
      makeUnit('peasant', 'red', 5 + i, 11);
      makeUnit('peasant', 'blue', 22 - i, 11);
    }
  }

  function killEntity(e) {
    if (e.type === 'building') map.setBuildingTiles(e, false);
    e.hp = 0;
    e.state = 'dead';
    const i = state.selected.indexOf(e);
    if (i !== -1) state.selected.splice(i, 1);
  }

  function pruneDead() {
    for (let i = state.entities.length - 1; i >= 0; i--) {
      if (state.entities[i].hp <= 0) state.entities.splice(i, 1);
    }
  }

  function entityCenterTile(e) {
    if (e.type === 'building') {
      return { x: e.tileX + Math.floor(e.w / 2), y: e.tileY + Math.floor(e.h / 2) };
    }
    return { x: e.tileX, y: e.tileY };
  }

  return {
    makeUnit, makeBuilding, spawnInitial,
    findEntityAt: (px, py) => findEntityAtPx(state.entities, px, py, config.tile),
    unitsOf:      (owner)   => entitiesOfKindOwner(state.entities, 'unit', owner),
    buildingsOf:  (owner)   => entitiesOfKindOwner(state.entities, 'building', owner),
    nearestOf:    (filter, fromX, fromY) => nearestEntity(state.entities, filter, fromX, fromY, config.tile),
    killEntity, pruneDead, entityCenterTile,
  };
}
