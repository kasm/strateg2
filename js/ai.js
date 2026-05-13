// Simple priority-based AI for the blue player.
// 1) Keep at least N peasants gathering gold + wood.
// 2) Build core economy: arrow building -> barracks -> archery range.
// 3) Train army until threshold; then attack-move at the human's nearest building.

const AI = {
  decideTimer: 0,
  waveTimer: 0,
};

function resetAI() { AI.decideTimer = 0; AI.waveTimer = 0; }

function updateAI(dt) {
  if (STATE.gameOver) return;
  AI.decideTimer -= dt;
  AI.waveTimer -= dt;
  if (AI.decideTimer > 0) return;
  AI.decideTimer = CFG.ai.decideEvery;

  const owner = 'blue';
  const me = STATE.players[owner];
  const myUnits = unitsOf(owner);
  const myBuildings = buildingsOf(owner);
  const peasants = myUnits.filter(u => u.kind === 'peasant');
  const army = myUnits.filter(u => u.kind === 'swordsman' || u.kind === 'archer');

  // Assign peasants jobs: half gold, half wood (or all gold if no arrow needs).
  let goldCount = peasants.filter(p => p.job === 'gatherGold').length;
  let woodCount = peasants.filter(p => p.job === 'gatherWood').length;
  const idlePeasants = peasants.filter(p => !p.job || p.state === 'idle' && !p.job);
  for (const p of peasants) {
    if (p.job) continue;
    if (goldCount <= woodCount) { p.job = 'gatherGold'; goldCount++; }
    else { p.job = 'gatherWood'; woodCount++; }
  }

  const has = kind => myBuildings.some(b => b.kind === kind);
  const townHall = myBuildings.find(b => b.kind === 'townHall');

  // Train more peasants if low
  if (townHall && peasants.length < CFG.ai.minPeasants && townHall.trainQueue.length < 2) {
    if (me.gold >= CFG.unit.peasant.cost.gold) {
      me.gold -= CFG.unit.peasant.cost.gold;
      townHall.trainQueue.push('peasant');
    }
  }

  // Build arrow building first if missing
  if (!has('arrowBuilding') && me.gold >= 100 && me.wood >= 150) {
    tryAIBuild('arrowBuilding', 22, 6);
  } else if (!has('barracks') && me.gold >= 200 && me.wood >= 100) {
    tryAIBuild('barracks', 22, 13);
  } else if (!has('archeryRange') && me.gold >= 200 && me.wood >= 100) {
    tryAIBuild('archeryRange', 25, 13);
  }

  // Train combat units
  const barracks = myBuildings.find(b => b.kind === 'barracks');
  if (barracks && barracks.trainQueue.length < 2 && me.gold >= CFG.unit.swordsman.cost.gold) {
    me.gold -= CFG.unit.swordsman.cost.gold;
    barracks.trainQueue.push('swordsman');
  }
  const range = myBuildings.find(b => b.kind === 'archeryRange');
  if (range && range.trainQueue.length < 2 && me.gold >= CFG.unit.archer.cost.gold) {
    me.gold -= CFG.unit.archer.cost.gold;
    range.trainQueue.push('archer');
  }

  // Launch a wave
  if (AI.waveTimer <= 0 && army.length >= CFG.ai.armyThreshold) {
    const target = nearestOf(e => e.type === 'building' && e.owner === 'red', 5 * CFG.tile, 10 * CFG.tile);
    if (target) {
      for (const u of army) {
        u.job = 'attack';
        u.jobTarget = target;
      }
      AI.waveTimer = CFG.ai.waveCooldown;
    }
  }
}

function tryAIBuild(kind, tx, ty) {
  const def = CFG.building[kind];
  // Try a few spots around (tx, ty)
  for (let dy = 0; dy < 6; dy++) {
    for (let dx = -3; dx < 3; dx++) {
      const x = tx + dx, y = ty + dy;
      if (canPlaceBuilding(kind, x, y)) {
        const me = STATE.players.blue;
        if (me.gold < def.cost.gold || me.wood < def.cost.wood) return;
        me.gold -= def.cost.gold;
        me.wood -= def.cost.wood;
        const b = makeBuilding(kind, 'blue', x, y);
        STATE.entities.push(b);
        return;
      }
    }
  }
}
