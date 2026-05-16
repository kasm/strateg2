// PUBLIC API of the pathfinding module.
// Closes over the map's `isWalkable` so callers don't need to pass it on every call.

import { aStarSearch, findAdjacentWalkableTile } from './a-star.js';

/**
 * @typedef {Object} Pathfinding
 * @property {(sx:number, sy:number, gx:number, gy:number) => {x:number,y:number}[] | null} aStar
 *   Find a tile-path from start to goal. Returns [] if already there, null if unreachable.
 * @property {(tx:number, ty:number, w:number, h:number, fromX:number, fromY:number) => {x:number,y:number} | null} findAdjacentWalkable
 *   Walkable tile next to footprint (tx,ty,w,h) closest to (fromX,fromY) in tile coords.
 */

/**
 * @param {{ map: { isWalkable: (x:number, y:number) => boolean } }} deps
 * @returns {Pathfinding}
 */
export function createPathfinding({ map }) {
  return {
    aStar: (sx, sy, gx, gy) => aStarSearch(sx, sy, gx, gy, map.isWalkable),
    findAdjacentWalkable: (tx, ty, w, h, fromX, fromY) =>
      findAdjacentWalkableTile(tx, ty, w, h, fromX, fromY, map.isWalkable),
  };
}
