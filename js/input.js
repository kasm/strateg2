// Mouse + HUD handlers. Left-click selects (with drag-box). Right-click issues context action.

const INPUT = {
  canvas: null,
  mouse: { x: 0, y: 0, down: false, dragStart: null, dragRect: null },
};

function initInput() {
  const canvas = document.getElementById('canvas');
  INPUT.canvas = canvas;

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.button === 0) {
      // Left click: build placement or start drag-select.
      if (STATE.buildMode) {
        const tile = worldToTile(x, y);
        attemptBuild(tile.x, tile.y);
        return;
      }
      INPUT.mouse.dragStart = { x, y };
      INPUT.mouse.dragRect = { x, y, w: 0, h: 0 };
    } else if (e.button === 2) {
      handleRightClick(x, y);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    INPUT.mouse.x = x; INPUT.mouse.y = y;
    STATE.hoverTile = worldToTile(x, y);
    if (INPUT.mouse.dragStart) {
      const ds = INPUT.mouse.dragStart;
      INPUT.mouse.dragRect = {
        x: Math.min(ds.x, x), y: Math.min(ds.y, y),
        w: Math.abs(x - ds.x), h: Math.abs(y - ds.y),
      };
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (!INPUT.mouse.dragStart) return;
    const r = INPUT.mouse.dragRect;
    INPUT.mouse.dragStart = null;
    INPUT.mouse.dragRect = null;
    if (r.w < 4 && r.h < 4) {
      handleLeftClick(r.x, r.y, e.shiftKey);
    } else {
      selectInRect(r, e.shiftKey);
    }
    refreshTrainMenu();
  });

  // Build menu buttons
  document.querySelectorAll('#build-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.build;
      if (kind === 'cancel') { STATE.buildMode = null; }
      else { STATE.buildMode = { kind }; }
      refreshBuildButtons();
    });
  });

  // Train menu buttons
  document.querySelectorAll('#train-menu button').forEach(btn => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.train;
      const b = STATE.trainFrom;
      if (!b || b.hp <= 0) return;
      const def = CFG.unit[kind];
      const me = STATE.players.red;
      if (me.gold < def.cost.gold) return;
      me.gold -= def.cost.gold;
      b.trainQueue.push(kind);
    });
  });

  document.getElementById('restart').addEventListener('click', () => {
    initMap();
    spawnInitialEntities();
    STATE.gameOver = null;
    document.getElementById('game-over').style.display = 'none';
    resetAI();
  });
}

function refreshBuildButtons() {
  document.querySelectorAll('#build-menu button').forEach(btn => {
    btn.classList.toggle('active', STATE.buildMode && STATE.buildMode.kind === btn.dataset.build);
  });
}

function handleLeftClick(x, y, shift) {
  const e = findEntityAt(x, y);
  if (!shift) STATE.selected = [];
  if (e && e.owner === 'red') {
    if (!STATE.selected.includes(e)) STATE.selected.push(e);
  } else if (e) {
    // Selecting an enemy/neutral building shows its info but does not command.
    STATE.selected = [e];
  }
}

function selectInRect(rect, shift) {
  if (!shift) STATE.selected = [];
  for (const e of STATE.entities) {
    if (e.type !== 'unit' || e.owner !== 'red' || e.hp <= 0) continue;
    if (e.x >= rect.x && e.x <= rect.x + rect.w && e.y >= rect.y && e.y <= rect.y + rect.h) {
      if (!STATE.selected.includes(e)) STATE.selected.push(e);
    }
  }
}

function handleRightClick(x, y) {
  if (STATE.buildMode) { STATE.buildMode = null; refreshBuildButtons(); return; }
  if (STATE.selected.length === 0) return;
  const tgt = findEntityAt(x, y);
  const tile = worldToTile(x, y);
  for (const u of STATE.selected) {
    if (u.type !== 'unit' || u.owner !== 'red') continue;
    issueOrder(u, tgt, tile);
  }
}

function issueOrder(u, tgt, tile) {
  // Reset job
  u.job = null; u.jobTarget = null; u.target = null; u.targetTile = null; u.path = null;
  if (tgt) {
    if (tgt.owner && tgt.owner !== u.owner && tgt.owner !== 'neutral') {
      u.job = 'attack'; u.jobTarget = tgt; return;
    }
    if (tgt.kind === 'goldMine') {
      u.job = 'gatherGold'; u.jobTarget = tgt; return;
    }
    if (tgt.type === 'building' && tgt.kind === 'arrowBuilding' && tgt.owner === u.owner) {
      // Manually haul wood here
      u.job = 'haulWood'; u.jobTarget = tgt; return;
    }
    if (tgt.type === 'unit' && tgt.kind === 'archer' && tgt.owner === u.owner && u.kind === 'peasant') {
      // Haul arrows to this archer
      const ab = nearestOf(e => e.type === 'building' && e.kind === 'arrowBuilding' && e.owner === u.owner, u.x, u.y);
      if (ab) { u.job = 'haulArrows'; u.jobTarget = tgt; u.target = ab; return; }
    }
    if (tgt.type === 'building' && tgt.owner === u.owner) {
      // Move adjacent to friendly building
      moveAdjacentTo(u, tgt);
      return;
    }
    // Generic: move toward target
    moveAdjacentTo(u, tgt);
    return;
  }
  const t = tileAt(tile.x, tile.y);
  if (t && t.type === 'forest') {
    u.job = 'gatherWood'; u.targetTile = { x: tile.x, y: tile.y }; return;
  }
  // Plain move
  if (isWalkable(tile.x, tile.y)) setMoveTarget(u, tile.x, tile.y);
}

function attemptBuild(tx, ty) {
  const kind = STATE.buildMode.kind;
  if (!canPlaceBuilding(kind, tx, ty)) return;
  const def = CFG.building[kind];
  const me = STATE.players.red;
  if (me.gold < def.cost.gold || me.wood < def.cost.wood) return;
  me.gold -= def.cost.gold;
  me.wood -= def.cost.wood;
  const b = makeBuilding(kind, 'red', tx, ty);
  STATE.entities.push(b);
  STATE.buildMode = null;
  refreshBuildButtons();
}

function refreshTrainMenu() {
  const menu = document.getElementById('train-menu');
  STATE.trainFrom = null;
  if (STATE.selected.length === 1) {
    const s = STATE.selected[0];
    if (s.type === 'building' && s.owner === 'red' && CFG.building[s.kind].trains.length) {
      STATE.trainFrom = s;
      const allowed = new Set(CFG.building[s.kind].trains);
      document.querySelectorAll('#train-menu button').forEach(btn => {
        btn.style.display = allowed.has(btn.dataset.train) ? '' : 'none';
      });
      document.getElementById('train-title').textContent = 'Train from ' + s.kind + ':';
      menu.style.display = '';
      return;
    }
  }
  menu.style.display = 'none';
}
