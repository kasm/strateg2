// Internal: per-frame scene composition (tiles, buildings, units, projectiles, overlays).
//
// Coordinate handling: drawing happens inside a `ctx.save() / scale() / translate()`
// block keyed off `client.camera`. The block converts SIM-PX to SCREEN-PX so sprite
// code below this layer keeps using `config.tile` and `entity.x/.y` unchanged.
// Screen-space overlays (drag-select rectangle) draw after `ctx.restore()`.

import { drawBuilding, drawUnit, drawUnitStack, drawUnitSpread } from './sprites.js';
import { canAfford } from '../../core/economy.js';

export function drawScene(ctx, { state, client, config, map, getDragRect, selectedIdSet }) {
  const tile = config.tile;
  const cam  = client.camera;
  const canvasW = cam.canvasW, canvasH = cam.canvasH;

  // Background fill in raw screen space — covers any area outside the map at extreme zooms.
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, canvasW, canvasH);

  ctx.save();
  const scale = cam.tilePx / tile;
  ctx.scale(scale, scale);
  ctx.translate(-cam.tileX * tile, -cam.tileY * tile);

  // Visible tile range — skip rows/cols off-screen so render cost scales with the
  // viewport, not the whole map.
  const vis = cam.visibleTiles();
  const x0 = Math.max(0, Math.floor(cam.tileX));
  const y0 = Math.max(0, Math.floor(cam.tileY));
  const x1 = Math.min(map.w, Math.ceil(cam.tileX + vis.w));
  const y1 = Math.min(map.h, Math.ceil(cam.tileY + vis.h));

  // Tiles
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = map.tiles[y][x];
      let c = config.colors.grass;
      if      (t.type === 'forest')   c = config.colors.forest;
      else if (t.type === 'goldmine') c = config.colors.goldmine;
      else if (t.type === 'blocked')  c = config.colors.blocked;
      ctx.fillStyle = c;
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }

  // Grid lines
  ctx.strokeStyle = config.colors.grid;
  ctx.lineWidth = 1 / scale;
  for (let x = x0; x <= x1; x++) {
    ctx.beginPath(); ctx.moveTo(x * tile, y0 * tile); ctx.lineTo(x * tile, y1 * tile); ctx.stroke();
  }
  for (let y = y0; y <= y1; y++) {
    ctx.beginPath(); ctx.moveTo(x0 * tile, y * tile); ctx.lineTo(x1 * tile, y * tile); ctx.stroke();
  }

  // Buildings (under units)
  for (const e of state.entities) {
    if (e.type === 'building' && e.hp > 0) drawBuilding(ctx, e, config, selectedIdSet);
  }
  // Units — render mode selects how stacks (same owner/kind on same tile) are displayed.
  const mode = client.stackMode || 'spread';
  if (mode === 'overlap') {
    for (const e of state.entities) {
      if (e.type === 'unit' && e.hp > 0 && e.insideBuildingId == null) drawUnit(ctx, e, config, selectedIdSet);
    }
  } else {
    const groups = new Map();
    for (const e of state.entities) {
      if (e.type !== 'unit' || e.hp <= 0) continue;
      if (e.insideBuildingId != null) continue;
      const key = `${e.owner}|${e.kind}|${e.tileX},${e.tileY}`;
      let g = groups.get(key);
      if (!g) { g = []; groups.set(key, g); }
      g.push(e);
    }
    const draw = mode === 'badge' ? drawUnitStack : drawUnitSpread;
    for (const g of groups.values()) draw(ctx, g, config, selectedIdSet);
  }
  // Projectiles
  ctx.fillStyle = config.colors.arrow;
  for (const p of state.projectiles) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);

  // Build-mode ghost
  if (client.buildMode && client.hoverTile) {
    const def = config.building[client.buildMode.kind];
    const me = state.players[client.playerId];
    const ok = map.canPlaceBuilding(client.buildMode.kind, client.hoverTile.x, client.hoverTile.y) &&
               canAfford(me, def.cost);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#4caf50' : '#d83b3b';
    ctx.fillRect(client.hoverTile.x * tile, client.hoverTile.y * tile, def.w * tile, def.h * tile);
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Drag-box overlay — drawn in raw screen space (drag rect is stored in screen px).
  const dr = getDragRect && getDragRect();
  if (dr && (dr.w > 2 || dr.h > 2)) {
    ctx.strokeStyle = '#ffe44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(dr.x, dr.y, dr.w, dr.h);
  }
}
