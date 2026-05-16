// Internal: per-frame scene composition (tiles, buildings, units, projectiles, overlays).

import { drawBuilding, drawUnit } from './sprites.js';

export function drawScene(ctx, { state, config, map, getDragRect }) {
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
    if (e.type === 'building' && e.hp > 0) drawBuilding(ctx, e, config, state);
  }
  // Units
  for (const e of state.entities) {
    if (e.type === 'unit' && e.hp > 0) drawUnit(ctx, e, config, state);
  }
  // Projectiles
  ctx.fillStyle = config.colors.arrow;
  for (const p of state.projectiles) ctx.fillRect(p.x - 2, p.y - 2, 4, 4);

  // Build-mode ghost
  if (state.buildMode && state.hoverTile) {
    const def = config.building[state.buildMode.kind];
    const ok = map.canPlaceBuilding(state.buildMode.kind, state.hoverTile.x, state.hoverTile.y) &&
               state.players.red.gold >= def.cost.gold &&
               state.players.red.wood >= def.cost.wood;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#4caf50' : '#d83b3b';
    ctx.fillRect(state.hoverTile.x * tile, state.hoverTile.y * tile, def.w * tile, def.h * tile);
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
