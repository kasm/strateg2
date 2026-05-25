// PUBLIC API of the entities module.
// Owns entity construction, queries over the entity list, and removal.
//
// Maintains `state.entitiesById` as a Map<id, entity> kept in sync with `state.entities`.
// `byId(id)` is the only sanctioned way to resolve a stored entity-ref ID.

import { makeUnitRecord, makeBuildingRecord } from './factory.js';
import { findEntityAtPx, nearestEntity, entitiesOfKindOwner } from './queries.js';
import { ejectAllFromTower } from './garrison.internal.js';
import { seedTreasury } from '../../core/economy.js';
import { seedResearch } from '../../core/research.js';
import { emit } from '../../core/events.js';
import { hasTreasury, players } from '../../core/factions.js';

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
 * @property {(e:Object, killerOwner?:string) => void} killEntity
 * @property {() => void} pruneDead
 * @property {(e:Object) => {x:number,y:number}} entityCenterTile
 * @property {(tower:Object) => void} ejectAllFromTower
 *   Eject every garrisoned unit from `tower`. The `eject` command uses this;
 *   killEntity calls the underlying helper directly during a tower-death cleanup.
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
    const b = makeBuildingRecord(state._nextId++, kind, owner, tileX, tileY, def);
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
    state.events.length = 0;
    state.pve.waveTimer = 0;
    state.pve.raidAnnounced = false;
    state.pve.nextWaveAt = config.pve?.firstWaveAfterSec ?? 0;
    for (const side of ['red', 'blue']) {
      seedTreasury(state.players[side], config);
      seedResearch(state.players[side], config);
    }

    const yMid = Math.floor(map.h / 2);
    makeBuilding('goldMine', 'neutral', 4, yMid - 1);
    makeBuilding('goldMine', 'neutral', map.w - 6, yMid - 1);
    makeBuilding('townHall', 'red', 1, yMid - 2);
    makeBuilding('townHall', 'blue', map.w - 4, yMid - 2);
    for (let i = 0; i < 3; i++) {
      makeUnit('peasant', 'red', 5 + i, yMid + 1);
      makeUnit('peasant', 'blue', map.w - 6 - i, yMid + 1);
    }

    if (config.pve?.enabled) spawnBanditCamps();
  }

  /**
   * Place `config.pve.campCount` banditCamps at deterministic positions and
   * assign each a target player faction (round-robin over `players()`).
   * Both the spot ordering and the target-faction assignment alternate sides
   * so that raid pressure splits evenly between players from the very first
   * wave — no camp gets to send every raid against the same player just
   * because nearestOf() picks the first town hall on ties.
   *
   * Spots, in order: NW, SE, SW, NE. With campCount=2 that's opposite corners,
   * and the round-robin gives camp 0 -> first player, camp 1 -> second.
   */
  function spawnBanditCamps() {
    const count = Math.max(0, config.pve.campCount | 0);
    const yTop  = 1;
    const yBot  = Math.max(1, map.h - 4);
    const xLeft  = Math.max(2,             Math.floor(map.w * 0.25));
    const xRight = Math.min(map.w - 4,     Math.floor(map.w * 0.75));
    const spots = [
      { x: xLeft,  y: yTop }, // NW
      { x: xRight, y: yBot }, // SE
      { x: xLeft,  y: yBot }, // SW
      { x: xRight, y: yTop }, // NE
    ];
    const facs = players();
    for (let i = 0; i < count && i < spots.length; i++) {
      const s = spots[i];
      const camp = makeBuilding('banditCamp', 'wild', s.x, s.y);
      // Assigned target faction — read by the pve wave director when sending
      // bandits out. Defended against an empty player list (no-op camp).
      camp.targetFaction = facs.length > 0 ? facs[i % facs.length] : null;
    }
  }

  function killEntity(e, killerOwner) {
    if (e.type === 'building') {
      if (e.kind === 'tower' && e.garrisonIds && e.garrisonIds.length > 0) {
        map.setBuildingTiles(e, false);
        ejectAllFromTower(e, { state, config, map, pathfinding, entities: api });
      } else {
        map.setBuildingTiles(e, false);
      }
      // Camp destruction: award the killer's faction a configured bounty, and
      // emit a HUD event either way (so a defensive-only run still sees the
      // milestone). `killerOwner` is best-effort — combat passes it when known.
      if (e.kind === 'banditCamp') {
        const bounty = config.pve?.bountyOnDestroy ?? 0;
        if (bounty > 0 && killerOwner && hasTreasury(killerOwner)) {
          state.players[killerOwner].gold = (state.players[killerOwner].gold ?? 0) + bounty;
          emit(state, 'camp-destroyed', Math.round(8 / (1 / 30)), { faction: killerOwner, bounty });
        } else {
          emit(state, 'camp-destroyed', Math.round(8 / (1 / 30)), { faction: killerOwner ?? null, bounty: 0 });
        }
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
    ejectAllFromTower: (tower) => ejectAllFromTower(tower, { state, config, map, pathfinding, entities: api }),
  };
  return api;
}
