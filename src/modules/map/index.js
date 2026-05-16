// PUBLIC API of the map module.
// Owns the tile grid. Buildings are tracked here via tile.building back-references.

import { buildEmptyGrid, paintDefaultForests } from './grid.js';

/**
 * @typedef {Object} Tile
 * @property {'grass'|'forest'|'goldmine'|'blocked'} type
 * @property {Object|null} building   - back-ref to occupying building entity
 * @property {number}  [wood]         - remaining wood (forest tiles)
 *
 * @typedef {Object} MapModule
 * @property {number} w
 * @property {number} h
 * @property {Tile[][]} tiles
 * @property {(x:number, y:number) => Tile|null} tileAt
 * @property {(x:number, y:number) => boolean}  isWalkable
 * @property {(ax:number, ay:number, bx:number, by:number) => boolean} isAdjacent
 * @property {(px:number, py:number) => {x:number,y:number}} worldToTile
 * @property {(tx:number, ty:number) => {x:number,y:number}} tileCenter
 * @property {(kind:string, tx:number, ty:number) => boolean} canPlaceBuilding
 * @property {(building:Object, mark:boolean) => void} setBuildingTiles
 * @property {() => void} reset       - rebuild the grid to its initial state
 */

/**
 * @param {{ config: import('../../core/config.js').GameConfig }} deps
 * @returns {MapModule}
 */
export function createMap({ config }) {
  const w = config.mapW;
  const h = config.mapH;

  // Tiles are mutable; we expose the array but mutate in place so existing references stay valid.
  const state = { tiles: buildEmptyGrid(w, h) };

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    return state.tiles[y][x];
  }

  function isWalkable(x, y) {
    const t = tileAt(x, y);
    if (!t) return false;
    if (t.type === 'blocked') return false;
    if (t.building) return false;
    return true;
  }

  function isAdjacent(ax, ay, bx, by) {
    return Math.abs(ax - bx) <= 1 && Math.abs(ay - by) <= 1 && !(ax === bx && ay === by);
  }

  function worldToTile(px, py) {
    return { x: Math.floor(px / config.tile), y: Math.floor(py / config.tile) };
  }

  function tileCenter(tx, ty) {
    return { x: tx * config.tile + config.tile / 2, y: ty * config.tile + config.tile / 2 };
  }

  function canPlaceBuilding(kind, tx, ty) {
    const def = config.building[kind];
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const t = tileAt(tx + dx, ty + dy);
        if (!t) return false;
        if (t.type !== 'grass') return false;
        if (t.building) return false;
      }
    }
    return true;
  }

  function setBuildingTiles(building, mark) {
    const def = config.building[building.kind];
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const t = tileAt(building.tileX + dx, building.tileY + dy);
        if (t) t.building = mark ? building : null;
      }
    }
  }

  function reset() {
    // Replace tiles in place — keep referential identity of the outer object.
    const fresh = buildEmptyGrid(w, h);
    paintDefaultForests(fresh, w, h, config.resources.forestWood);
    state.tiles.length = 0;
    for (const row of fresh) state.tiles.push(row);
  }

  reset();

  return {
    w, h,
    get tiles() { return state.tiles; },
    tileAt, isWalkable, isAdjacent,
    worldToTile, tileCenter,
    canPlaceBuilding, setBuildingTiles,
    reset,
  };
}
