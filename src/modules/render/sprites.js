// Internal: per-entity sprite drawing.
//
// `selectedIdSet` is a Set<id> built once per frame (see render/index.js); entities
// check membership by id without dereferencing into client state.

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
  if (b.kind === 'tower')         return `Tower ${b.garrisonIds.length}/4`;
  return b.kind;
}

const FILL_BY_KIND = {
  townHall:      '#7a5c2e',
  barracks:      '#5e3b2a',
  archeryRange:  '#3b5e2a',
  arrowBuilding: '#8a7a3a',
  tower:         '#6e6e6e',
};

export function drawBuilding(ctx, b, config, selectedIdSet) {
  const tile = config.tile;
  const x = b.tileX * tile, y = b.tileY * tile;
  const w = b.w * tile,     h = b.h * tile;
  const fill = b.kind === 'goldMine' ? config.colors.goldmine : (FILL_BY_KIND[b.kind] || '#555');
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = ownerColor(b.owner, false, config.colors);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  if (selectedIdSet.has(b.id)) {
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

function drawUnitShape(ctx, kind, cx, cy, r) {
  if (kind === 'peasant') {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (kind === 'swordsman') {
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
  } else if (kind === 'archer') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.lineTo(cx - r, cy + r);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

function drawCarryDot(ctx, u, cx, cy, r, config) {
  ctx.fillStyle =
    u.carrying.kind === 'gold' ? '#ffd66e' :
    u.carrying.kind === 'wood' ? '#8a5a2a' :
    config.colors.arrow;
  ctx.fillRect(cx + r - 2, cy - r - 2, 4, 4);
}

function drawCountBadge(ctx, x, y, n) {
  const text = 'x' + n;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const padX = 3;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x + padX, y + 1);
  ctx.textBaseline = 'alphabetic';
}

function drawUnitAt(ctx, u, cx, cy, r, config, selectedIdSet) {
  const dim = (u.kind === 'archer' && u.arrows <= 0);
  ctx.fillStyle = ownerColor(u.owner, dim, config.colors);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  drawUnitShape(ctx, u.kind, cx, cy, r);
  if (selectedIdSet.has(u.id)) {
    ctx.strokeStyle = config.colors.select;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke();
  }
  drawHpBar(ctx, cx - r, cy - r - 6, r * 2, 3, u.hp / u.maxHp, config.colors);
  if (u.carrying) drawCarryDot(ctx, u, cx, cy, r, config);
  if (u.kind === 'archer') {
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(u.arrows, cx, cy + r + 9);
  }
}

export function drawUnit(ctx, u, config, selectedIdSet) {
  drawUnitAt(ctx, u, u.x, u.y, config.tile * 0.35, config, selectedIdSet);
}

function stackOffsets(n, tile) {
  const d = tile * 0.22;
  if (n === 2) return [[-d, 0], [d, 0]];
  if (n === 3) return [[0, -d], [-d, d * 0.6], [d, d * 0.6]];
  if (n === 4) return [[-d, -d * 0.6], [d, -d * 0.6], [-d, d * 0.6], [d, d * 0.6]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  return out;
}

export function drawUnitSpread(ctx, group, config, selectedIdSet) {
  if (group.length === 1) { drawUnit(ctx, group[0], config, selectedIdSet); return; }
  const r = config.tile * 0.35;
  const sorted = group.slice().sort((a, b) => a.id - b.id);
  const offsets = stackOffsets(sorted.length, config.tile);
  const cx = sorted[0].x, cy = sorted[0].y;
  for (let i = 0; i < sorted.length; i++) {
    const u = sorted[i];
    const [dx, dy] = offsets[i];
    drawUnitAt(ctx, u, cx + dx, cy + dy, r, config, selectedIdSet);
  }
}

export function drawUnitStack(ctx, group, config, selectedIdSet) {
  if (group.length === 1) { drawUnit(ctx, group[0], config, selectedIdSet); return; }

  const r = config.tile * 0.35;
  const rep = group[0];
  const kind = rep.kind;
  const owner = rep.owner;

  let sumHp = 0, sumMaxHp = 0, sumArrows = 0;
  let selectedCount = 0;
  let carrier = null;
  let anyArrows = false;
  for (const u of group) {
    sumHp += u.hp;
    sumMaxHp += u.maxHp;
    if (kind === 'archer') { sumArrows += u.arrows; if (u.arrows > 0) anyArrows = true; }
    if (selectedIdSet.has(u.id)) selectedCount++;
    if (u.carrying && !carrier) carrier = u;
  }

  const dim = (kind === 'archer' && !anyArrows);
  ctx.fillStyle = ownerColor(owner, dim, config.colors);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  drawUnitShape(ctx, kind, rep.x, rep.y, r);

  if (selectedCount > 0) {
    ctx.strokeStyle = config.colors.select;
    ctx.lineWidth = 2;
    if (selectedCount < group.length) ctx.setLineDash([3, 2]);
    ctx.beginPath(); ctx.arc(rep.x, rep.y, r + 3, 0, Math.PI * 2); ctx.stroke();
    if (selectedCount < group.length) ctx.setLineDash([]);
  }

  drawHpBar(ctx, rep.x - r, rep.y - r - 6, r * 2, 3, sumHp / sumMaxHp, config.colors);
  if (carrier) drawCarryDot(ctx, carrier, rep.x, rep.y, r, config);
  if (kind === 'archer') {
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(sumArrows, rep.x, rep.y + r + 9);
  }

  drawCountBadge(ctx, rep.x + r - 2, rep.y - r - 14, group.length);
}

export function drawHpBar(ctx, x, y, w, h, pct, colors) {
  ctx.fillStyle = colors.hpBg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? colors.hp : pct > 0.25 ? '#caa72b' : '#d83b3b';
  ctx.fillRect(x, y, w * Math.max(0, pct), h);
}
