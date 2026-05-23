// Client-only viewport / camera state. Pure render concern — never observed by
// the simulation. Coordinate spaces:
//
//   - SIM-PX:    sim/world pixels. 1 tile = `simTile` (= config.tile = 32 px). All
//                entity positions (`u.x`, `u.y`, `p.x`, `p.y`) live here.
//   - SCREEN-PX: canvas pixels. What the user sees.
//
// `tilePx` is the on-screen pixel size of a tile (zoom). `tileX` / `tileY` is the
// fractional tile coordinate of the top-left visible tile (pan). At the defaults
// (`tileX:0, tileY:0, tilePx:simTile`) screen-px = sim-px and the render is
// pixel-identical to the pre-camera codepath.

export const ZOOM_LEVELS = [16, 24, 32, 48, 64];

/**
 * @typedef {Object} Camera
 * @property {number} tileX        - top-left visible tile X (fractional, in tiles)
 * @property {number} tileY        - top-left visible tile Y (fractional, in tiles)
 * @property {number} tilePx       - on-screen pixel size of one tile (zoom)
 * @property {number} canvasW
 * @property {number} canvasH
 * @property {number} simTile      - sim-px tile size (constant; never changes)
 * @property {(w:number, h:number) => void} setMap
 * @property {(px:number) => void}          setZoom
 * @property {() => {w:number,h:number}}    visibleTiles
 * @property {(px:number,py:number) => {x:number,y:number}} worldPxToScreen
 * @property {(sx:number,sy:number) => {x:number,y:number}} screenToWorldPx
 * @property {(sx:number,sy:number) => {x:number,y:number}} screenToTile
 * @property {(tx:number,ty:number) => void} centerOnTile
 * @property {(dxTiles:number, dyTiles:number) => void} pan
 */

/**
 * @param {{ canvasW:number, canvasH:number, simTile:number }} opts
 * @returns {Camera}
 */
export function createCamera({ canvasW, canvasH, simTile }) {
  const state = {
    tileX: 0,
    tileY: 0,
    tilePx: simTile,
    mapW: 0,
    mapH: 0,
  };

  function visibleTiles() {
    return { w: canvasW / state.tilePx, h: canvasH / state.tilePx };
  }

  function clamp() {
    const vis = visibleTiles();
    const maxX = Math.max(0, state.mapW - vis.w);
    const maxY = Math.max(0, state.mapH - vis.h);
    if (state.tileX < 0)     state.tileX = 0;
    if (state.tileY < 0)     state.tileY = 0;
    if (state.tileX > maxX)  state.tileX = maxX;
    if (state.tileY > maxY)  state.tileY = maxY;
  }

  function setMap(w, h) { state.mapW = w; state.mapH = h; clamp(); }
  function setZoom(px)  { state.tilePx = px; clamp(); }

  function worldPxToScreen(px, py) {
    const scale = state.tilePx / simTile;
    return {
      x: (px - state.tileX * simTile) * scale,
      y: (py - state.tileY * simTile) * scale,
    };
  }

  function screenToWorldPx(sx, sy) {
    const scale = state.tilePx / simTile;
    return {
      x: sx / scale + state.tileX * simTile,
      y: sy / scale + state.tileY * simTile,
    };
  }

  function screenToTile(sx, sy) {
    return {
      x: Math.floor(state.tileX + sx / state.tilePx),
      y: Math.floor(state.tileY + sy / state.tilePx),
    };
  }

  function centerOnTile(tx, ty) {
    const vis = visibleTiles();
    state.tileX = tx - vis.w / 2;
    state.tileY = ty - vis.h / 2;
    clamp();
  }

  function pan(dxTiles, dyTiles) {
    state.tileX += dxTiles;
    state.tileY += dyTiles;
    clamp();
  }

  return {
    get tileX()    { return state.tileX; },
    get tileY()    { return state.tileY; },
    get tilePx()   { return state.tilePx; },
    get canvasW()  { return canvasW; },
    get canvasH()  { return canvasH; },
    get simTile()  { return simTile; },
    setMap, setZoom, visibleTiles,
    worldPxToScreen, screenToWorldPx, screenToTile,
    centerOnTile, pan,
  };
}
