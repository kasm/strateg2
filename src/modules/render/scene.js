// Internal: per-frame scene composition (tiles, buildings, units, projectiles, overlays).

import { drawBuilding, drawUnit, drawUnitStack, drawUnitSpread } from './sprites.js';

export function drawScene(ctx, { state, client, config, map, getDragRect, selectedIdSet }) {
  const tile = config.tile;

  ctx.clearRect(0, 0, map.w * tile, map.h * tile);

  // Tiles
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
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
  ctx.lineWidth = 1;
  for (let x = 0; x <= map.w; x++) {
    ctx.beginPath(); ctx.moveTo(x * tile, 0); ctx.lineTo(x * tile, map.h * tile); ctx.stroke();
  }
  for (let y = 0; y <= map.h; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * tile); ctx.lineTo(map.w * tile, y * tile); ctx.stroke();
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
    const ok = map.canPlaceBuilding(client.buildMode.kind, client.hoverTile.x, client.hoverTile.y) &&
               state.players.red.gold >= def.cost.gold &&
               state.players.red.wood >= def.cost.wood;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#4caf50' : '#d83b3b';
    ctx.fillRect(client.hoverTile.x * tile, client.hoverTile.y * tile, def.w * tile, def.h * tile);
    ctx.globalAlpha = 1;
  }

  // Drag-box overlay
  const dr = getDragRect && getDragRect();
  if (dr && (dr.w > 2 || dr.h > 2)) {
    ctx.strokeStyle = '#ffe44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(dr.x, dr.y, dr.w, dr.h);
  }
}
