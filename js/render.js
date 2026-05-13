// Canvas rendering. Called once per animation frame.

let _ctx = null;
function initRender() {
  const c = document.getElementById('canvas');
  _ctx = c.getContext('2d');
}

function draw() {
  const ctx = _ctx;
  ctx.clearRect(0, 0, CFG.mapW * CFG.tile, CFG.mapH * CFG.tile);

  // Tiles
  for (let y = 0; y < MAP.h; y++) {
    for (let x = 0; x < MAP.w; x++) {
      const t = MAP.tiles[y][x];
      let c = CFG.colors.grass;
      if (t.type === 'forest') c = CFG.colors.forest;
      else if (t.type === 'goldmine') c = CFG.colors.goldmine;
      else if (t.type === 'blocked') c = CFG.colors.blocked;
      ctx.fillStyle = c;
      ctx.fillRect(x * CFG.tile, y * CFG.tile, CFG.tile, CFG.tile);
    }
  }
  // Grid lines
  ctx.strokeStyle = CFG.colors.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= MAP.w; x++) {
    ctx.beginPath(); ctx.moveTo(x * CFG.tile, 0); ctx.lineTo(x * CFG.tile, MAP.h * CFG.tile); ctx.stroke();
  }
  for (let y = 0; y <= MAP.h; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * CFG.tile); ctx.lineTo(MAP.w * CFG.tile, y * CFG.tile); ctx.stroke();
  }

  // Buildings (under units)
  for (const e of STATE.entities) {
    if (e.type !== 'building' || e.hp <= 0) continue;
    drawBuilding(ctx, e);
  }
  // Units
  for (const e of STATE.entities) {
    if (e.type !== 'unit' || e.hp <= 0) continue;
    drawUnit(ctx, e);
  }
  // Projectiles
  ctx.fillStyle = CFG.colors.arrow;
  for (const p of STATE.projectiles) {
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }

  // Build mode ghost
  if (STATE.buildMode && STATE.hoverTile) {
    const def = CFG.building[STATE.buildMode.kind];
    const ok = canPlaceBuilding(STATE.buildMode.kind, STATE.hoverTile.x, STATE.hoverTile.y) &&
               STATE.players.red.gold >= def.cost.gold && STATE.players.red.wood >= def.cost.wood;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = ok ? '#4caf50' : '#d83b3b';
    ctx.fillRect(STATE.hoverTile.x * CFG.tile, STATE.hoverTile.y * CFG.tile, def.w * CFG.tile, def.h * CFG.tile);
    ctx.globalAlpha = 1;
  }

  // Drag-box
  if (INPUT.mouse.dragRect && (INPUT.mouse.dragRect.w > 2 || INPUT.mouse.dragRect.h > 2)) {
    const r = INPUT.mouse.dragRect;
    ctx.strokeStyle = '#ffe44a';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }

  updateHUD();
}

function ownerColor(owner, light) {
  if (owner === 'red') return light ? CFG.colors.redLight : CFG.colors.red;
  if (owner === 'blue') return light ? CFG.colors.blueLight : CFG.colors.blue;
  return '#aaa';
}

function drawBuilding(ctx, b) {
  const x = b.tileX * CFG.tile, y = b.tileY * CFG.tile;
  const w = b.w * CFG.tile, h = b.h * CFG.tile;
  let fill = '#555';
  if (b.kind === 'townHall') fill = '#7a5c2e';
  else if (b.kind === 'barracks') fill = '#5e3b2a';
  else if (b.kind === 'archeryRange') fill = '#3b5e2a';
  else if (b.kind === 'arrowBuilding') fill = '#8a7a3a';
  else if (b.kind === 'goldMine') fill = CFG.colors.goldmine;
  ctx.fillStyle = fill;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = ownerColor(b.owner);
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  if (STATE.selected.includes(b)) {
    ctx.strokeStyle = CFG.colors.select;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  }
  // HP bar
  drawHpBar(ctx, x + 4, y + h - 8, w - 8, 4, b.hp / b.maxHp);

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(buildingLabel(b), x + w / 2, y + 14);
}

function buildingLabel(b) {
  if (b.kind === 'arrowBuilding') return `Arrow ${b.wood}w/${b.arrows}a`;
  if (b.kind === 'goldMine') return `Mine ${b.gold}`;
  if (b.kind === 'townHall') return 'TH';
  if (b.kind === 'barracks') return 'Barracks';
  if (b.kind === 'archeryRange') return 'Archery';
  return b.kind;
}

function drawUnit(ctx, u) {
  const r = CFG.tile * 0.35;
  const dim = (u.kind === 'archer' && u.arrows <= 0);
  ctx.fillStyle = ownerColor(u.owner, dim);
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
  if (STATE.selected.includes(u)) {
    ctx.strokeStyle = CFG.colors.select;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u.x, u.y, r + 3, 0, Math.PI * 2); ctx.stroke();
  }
  // HP bar
  drawHpBar(ctx, u.x - r, u.y - r - 6, r * 2, 3, u.hp / u.maxHp);
  // Carrying icon
  if (u.carrying) {
    ctx.fillStyle = u.carrying.kind === 'gold' ? '#ffd66e' : u.carrying.kind === 'wood' ? '#8a5a2a' : CFG.colors.arrow;
    ctx.fillRect(u.x + r - 2, u.y - r - 2, 4, 4);
  }
  // Archer arrow count
  if (u.kind === 'archer') {
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(u.arrows, u.x, u.y + r + 9);
  }
}

function drawHpBar(ctx, x, y, w, h, pct) {
  ctx.fillStyle = CFG.colors.hpBg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = pct > 0.5 ? CFG.colors.hp : pct > 0.25 ? '#caa72b' : '#d83b3b';
  ctx.fillRect(x, y, w * Math.max(0, pct), h);
}

function updateHUD() {
  const me = STATE.players.red;
  document.getElementById('gold').textContent = Math.floor(me.gold);
  document.getElementById('wood').textContent = Math.floor(me.wood);
  document.getElementById('pop').textContent = unitsOf('red').length;

  const info = document.getElementById('selection-info');
  if (STATE.selected.length === 0) {
    info.textContent = '(no selection)';
  } else if (STATE.selected.length === 1) {
    info.textContent = describeEntity(STATE.selected[0]);
  } else {
    const counts = {};
    for (const s of STATE.selected) counts[s.kind] = (counts[s.kind] || 0) + 1;
    info.textContent = 'Selected: ' + Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ');
  }
}

function describeEntity(e) {
  if (e.type === 'unit') {
    let s = `${e.kind} (${e.owner})\nHP ${Math.ceil(e.hp)}/${e.maxHp}`;
    if (e.kind === 'archer') s += `\nArrows: ${e.arrows}/${CFG.unit.archer.quiverMax}`;
    if (e.job) s += `\nJob: ${e.job}`;
    if (e.carrying) s += `\nCarrying: ${e.carrying.amount} ${e.carrying.kind}`;
    return s;
  }
  let s = `${e.kind} (${e.owner})\nHP ${Math.ceil(e.hp)}/${e.maxHp}`;
  if (e.kind === 'arrowBuilding') s += `\nWood: ${e.wood}/${CFG.building.arrowBuilding.woodCap}\nArrows: ${e.arrows}/${CFG.building.arrowBuilding.arrowCap}`;
  if (e.kind === 'goldMine') s += `\nGold left: ${e.gold}`;
  if (e.trainQueue && e.trainQueue.length) s += `\nQueue: ${e.trainQueue.join(', ')}`;
  return s;
}
