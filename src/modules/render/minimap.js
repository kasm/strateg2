// Minimap renderer + click navigation.
//
// One small canvas drawn aspect-correct from the live map. The tile palette is
// painted once into an offscreen canvas (tiles are mostly static); per-frame
// work is just a single drawImage plus a pass over entities and the camera
// viewport rectangle. Click / drag re-centers the main camera on the clicked
// world tile.

const MAX_W = 240;
const MAX_H = 160;

/**
 * @param {{
 *   state:  import('../../core/game-state.js').GameState,
 *   client: import('../../client/client-state.js').ClientState,
 *   config: import('../../core/config.js').GameConfig,
 *   map:    import('../map/index.js').MapModule,
 * }} deps
 */
export function createMinimap({ state, client, config, map }) {
  let canvas = null;
  let ctx    = null;
  let bg     = null; // offscreen canvas with the painted tiles
  let bgDirty = true;

  // Aspect-correct minimap dimensions inside the (MAX_W, MAX_H) bounding box.
  // The longer map axis pins to its max; the shorter axis scales down.
  function fitToBox(mw, mh) {
    const ar = mw / mh;
    const boxAr = MAX_W / MAX_H;
    if (ar > boxAr) {
      return { w: MAX_W, h: Math.max(1, Math.round(MAX_W / ar)) };
    }
    return { w: Math.max(1, Math.round(MAX_H * ar)), h: MAX_H };
  }

  function paintBackground() {
    if (!ctx) return;
    bg = document.createElement('canvas');
    bg.width  = canvas.width;
    bg.height = canvas.height;
    const bctx = bg.getContext('2d');
    const sx = canvas.width  / map.w;
    const sy = canvas.height / map.h;
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.tiles[y][x];
        let c = config.colors.grass;
        if      (t.type === 'forest')   c = config.colors.forest;
        else if (t.type === 'goldmine') c = config.colors.goldmine;
        else if (t.type === 'blocked')  c = config.colors.blocked;
        bctx.fillStyle = c;
        // +1 px so neighbouring cells overlap and there's no sub-pixel gap.
        bctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.ceil(sx) + 1, Math.ceil(sy) + 1);
      }
    }
    bgDirty = false;
  }

  function onMouseEvent(e, isDrag) {
    if (!canvas) return;
    if (!isDrag && e.buttons !== 1) return;
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) / canvas.width  * map.w;
    const sy = (e.clientY - r.top)  / canvas.height * map.h;
    client.camera.centerOnTile(sx, sy);
  }

  function init() {
    canvas = document.getElementById('minimap');
    if (!canvas) return;
    const dims = fitToBox(map.w, map.h);
    canvas.width  = dims.w;
    canvas.height = dims.h;
    canvas.style.display = '';
    ctx = canvas.getContext('2d');
    paintBackground();
    canvas.addEventListener('mousedown', (e) => onMouseEvent(e, false));
    canvas.addEventListener('mousemove', (e) => onMouseEvent(e, true));
  }

  function draw() {
    if (!ctx) return;
    if (bgDirty) paintBackground();

    // Background (tiles)
    ctx.drawImage(bg, 0, 0);

    const sx = canvas.width  / map.w;
    const sy = canvas.height / map.h;

    // Entities — buildings as small squares, units as 2-px dots.
    for (const e of state.entities) {
      if (e.hp <= 0) continue;
      const color =
        e.owner === 'red'     ? config.colors.red  :
        e.owner === 'blue'    ? config.colors.blue :
        e.kind  === 'goldMine' ? config.colors.goldmine :
        '#aaa';
      ctx.fillStyle = color;
      if (e.type === 'building') {
        ctx.fillRect(e.tileX * sx, e.tileY * sy, Math.max(2, e.w * sx), Math.max(2, e.h * sy));
      } else if (e.type === 'unit' && e.insideBuildingId == null) {
        const x = (e.x / config.tile) * sx;
        const y = (e.y / config.tile) * sy;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    // Viewport rectangle.
    const cam = client.camera;
    const vis = cam.visibleTiles();
    ctx.strokeStyle = '#ffe44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      cam.tileX * sx + 0.5,
      cam.tileY * sy + 0.5,
      vis.w * sx,
      vis.h * sy,
    );
  }

  return { init, draw };
}
