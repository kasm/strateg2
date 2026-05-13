// Entity factories. All entities share an integer id and an owner ('red' | 'blue' | 'neutral').

let _nextId = 1;
const STATE = {
  entities: [],    // units + buildings
  projectiles: [], // {x,y,tx,ty,vx,vy,dmg,owner}
  players: {
    red:  { gold: CFG.startResources.gold, wood: CFG.startResources.wood },
    blue: { gold: CFG.startResources.gold, wood: CFG.startResources.wood },
  },
  selected: [],
  buildMode: null,    // {kind} when human is placing a building
  trainFrom: null,    // building reference if train menu is open
  gameOver: null,     // 'red' or 'blue' winner key
  hoverTile: null,
};

function makeUnit(kind, owner, tileX, tileY) {
  const def = CFG.unit[kind];
  const c = tileCenter(tileX, tileY);
  return {
    id: _nextId++,
    type: 'unit',
    kind,
    owner,
    tileX, tileY,
    x: c.x, y: c.y,
    hp: def.hp,
    maxHp: def.hp,
    state: 'idle',
    path: null,
    target: null,        // entity ref or {tx,ty} or building ref
    job: null,           // 'gatherGold'|'gatherWood'|'haulWood'|'haulArrows'|'attack'|null
    jobTarget: null,     // entity used for job
    carrying: null,      // {kind:'gold'|'wood'|'arrows', amount}
    cooldown: 0,
    arrows: 0,           // archer quiver
    gatherTimer: 0,
  };
}

function makeBuilding(kind, owner, tileX, tileY) {
  const def = CFG.building[kind];
  const b = {
    id: _nextId++,
    type: 'building',
    kind,
    owner,
    tileX, tileY,
    w: def.w, h: def.h,
    hp: def.hp,
    maxHp: def.hp,
    trainQueue: [],
    trainTimer: 0,
  };
  if (kind === 'arrowBuilding') {
    b.wood = 0;
    b.arrows = 0;
    b.arrowTimer = 0;
  }
  if (kind === 'goldMine') {
    b.gold = CFG.resources.goldPerMine;
  }
  setBuildingTiles(b, true);
  return b;
}

function spawnInitialEntities() {
  STATE.entities = [];
  STATE.projectiles = [];
  STATE.players.red = { gold: CFG.startResources.gold, wood: CFG.startResources.wood };
  STATE.players.blue = { gold: CFG.startResources.gold, wood: CFG.startResources.wood };
  STATE.selected = [];
  STATE.gameOver = null;

  // Gold mines
  const gmRed = makeBuilding('goldMine', 'neutral', 4, 9);
  const gmBlue = makeBuilding('goldMine', 'neutral', 24, 9);
  STATE.entities.push(gmRed, gmBlue);

  // Town Halls
  const thRed = makeBuilding('townHall', 'red', 1, 8);
  const thBlue = makeBuilding('townHall', 'blue', 26, 8);
  STATE.entities.push(thRed, thBlue);

  // 3 peasants per side
  for (let i = 0; i < 3; i++) {
    STATE.entities.push(makeUnit('peasant', 'red', 5 + i, 11));
    STATE.entities.push(makeUnit('peasant', 'blue', 22 - i, 11));
  }
}

function findEntityAt(px, py) {
  // Iterate reversed so most-recently-added (likely on top) is preferred.
  for (let i = STATE.entities.length - 1; i >= 0; i--) {
    const e = STATE.entities[i];
    if (e.type === 'building') {
      const x0 = e.tileX * CFG.tile, y0 = e.tileY * CFG.tile;
      const x1 = x0 + e.w * CFG.tile, y1 = y0 + e.h * CFG.tile;
      if (px >= x0 && px < x1 && py >= y0 && py < y1) return e;
    } else {
      const dx = px - e.x, dy = py - e.y;
      if (dx * dx + dy * dy <= (CFG.tile * 0.45) ** 2) return e;
    }
  }
  return null;
}

function aliveEntities() { return STATE.entities.filter(e => e.hp > 0); }
function unitsOf(owner) { return STATE.entities.filter(e => e.type === 'unit' && e.owner === owner && e.hp > 0); }
function buildingsOf(owner) { return STATE.entities.filter(e => e.type === 'building' && e.owner === owner && e.hp > 0); }

function nearestOf(filter, fromX, fromY) {
  let best = null, bd = Infinity;
  for (const e of STATE.entities) {
    if (e.hp <= 0) continue;
    if (!filter(e)) continue;
    const ex = e.type === 'building' ? (e.tileX + e.w / 2) * CFG.tile : e.x;
    const ey = e.type === 'building' ? (e.tileY + e.h / 2) * CFG.tile : e.y;
    const d = (ex - fromX) ** 2 + (ey - fromY) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function entityCenterTile(e) {
  if (e.type === 'building') {
    return { x: e.tileX + Math.floor(e.w / 2), y: e.tileY + Math.floor(e.h / 2) };
  }
  return { x: e.tileX, y: e.tileY };
}

function killEntity(e) {
  if (e.type === 'building') setBuildingTiles(e, false);
  e.hp = 0;
  e.state = 'dead';
  // remove from selection
  STATE.selected = STATE.selected.filter(s => s !== e);
}

function pruneDead() {
  STATE.entities = STATE.entities.filter(e => e.hp > 0);
}
