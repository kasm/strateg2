// Internal: per-entity sprite drawing.

export function ownerColor(owner, light, colors) {
  if (owner === 'red')  return light ? colors.redLight  : colors.red;
  if (owner === 'blue') return light ? colors.blueLight : colors.blue;
  return '#aaa';
}

export function buildingLabel(b) {
  if (b.kind === 'arrowBuilding') return `Arrow ${b.wood}w/${b.arrows}a`;
  if (b.kind === 'goldMine')      return `Mine ${b.gold}`;
  if (b.kind === 'townHall')      return 'TH';
  if (b.kind === 'barracks')      return 'Barracks';
  if (b.kind === 'archeryRange')  return 'Archery';
  return b.kind;
}

const FILL_BY_KIND = {
  townHall:      '#7a5c2e',
  barracks:      '#5e3b2a',
  archeryRange:  '#3b5e2a',
  arrowBuilding: '#8a7a3a',
};

export function drawBuilding(ctx, b, config, state) {
  const tile = config.tile;
  const x = b.tileX * tile, y = b.tileY * tile;
  const w = b.w * tile,     h = b.h * tile;
  const fill = b.kind === 'goldMine' ? config.colors.goldmine : (FILL_BY_KIND[b.kind] || '#555');
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = ownerColor(b.owner, false, config.colors);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  if (state.selected.includes(b)) {
    ctx.strokeStyle = config.colors.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
  drawHpBar(ctx, x + 4, y + h - 8, w - 8, 4, b.hp / b.maxHp, config.colors);
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(buildingLabel(b), x + w / 2, y + 14);
}

export function drawUnit(ctx, u, config, state) {
  const r = config.tile * 0.35;
  const dim = (u.kind === 'archer' && u.arrows <= 0);
  ctx.fillStyle = ownerColor(u.owner, dim, config.colors);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  if (u.kind === 'peasant') {
    ctx.beginPath(); ctx.arc(u.x, u.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (u.kind === 'swordsman') {
    ctx.fillRect(u.x - r, u.y - r, r * 2, r * 2);
    ctx.strokeRect(u.x - r, u.y - r, r * 2, r * 2);
  } else if (u.kind === 'archer') {
    ctx.beginPath();
    ctx.moveTo(u.x, u.y - r);
    ctx.lineTo(u.x + r, u.y + r);
    ctx.lineTo(u.x - r, u.y + r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  if (state.selected.includes(u)) {
    ctx.strokeStyle = config.colors.select;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 3, 0, Math.PI * 2); ctx.stroke();
  }
  drawHpBar(ctx, u.x - r, u.y - r - 6, r * 2, 3, u.hp / u.maxHp, config.colors);
  if (u.carrying) {
    ctx.fillStyle =
      u.carrying.kind === 'gold' ? '#ffd66e' :
      u.carrying.kind === 'wood' ? '#8a5a2a' :
      config.colors.arrow;
    ctx.fillRect(u.x + r - 2, u.y - r - 2, 4, 4);
  }
  if (u.kind === 'archer') {
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(u.arrows, u.x, u.y + r + 9);
  }
}

export function drawHpBar(ctx, x, y, w, h, pct, colors) {
  ctx.fillStyle = colors.hpBg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? colors.hp : pct > 0.25 ? '#caa72b' : '#d83b3b';
  ctx.fillRect(x, y, w * Math.max(0, pct), h);
}
