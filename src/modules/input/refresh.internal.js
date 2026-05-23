// Internal: HUD refresh helpers — recompute the visible state of menus and
// buttons based on the current selection. Pure-DOM (no transport, no command
// submission); they only set element visibility and `client.*FromId` pointers.

export function refreshBuildButtons(client) {
  document.querySelectorAll('#build-menu button').forEach(btn => {
    btn.classList.toggle('active', !!client.buildMode && client.buildMode.kind === btn.dataset.build);
  });
}

// Refresh the per-selection building menus (train + research) and the eject button.
// Public name kept as `refreshTrainMenu` for callers; it now covers research too.
export function refreshTrainMenu(client, entities, config, state) {
  const trainMenu = document.getElementById('train-menu');
  const researchMenu = document.getElementById('research-menu');
  client.trainFromId = null;
  client.researchFromId = null;

  const s = client.selectedIds.length === 1 ? entities.byId(client.selectedIds[0]) : null;
  const ownBuilding = s && s.type === 'building' && s.owner === client.playerId;
  const bDef = ownBuilding ? config.building[s.kind] : null;

  if (bDef && bDef.trains.length) {
    client.trainFromId = s.id;
    const allowed = new Set(bDef.trains);
    trainMenu.querySelectorAll('button').forEach(btn => {
      btn.style.display = allowed.has(btn.dataset.train) ? '' : 'none';
    });
    document.getElementById('train-title').textContent = 'Train from ' + s.kind + ':';
    trainMenu.style.display = '';
  } else {
    trainMenu.style.display = 'none';
  }

  if (researchMenu && bDef && bDef.researches) {
    client.researchFromId = s.id;
    refreshResearchButtons(s, client, config, state);
    researchMenu.style.display = '';
  } else if (researchMenu) {
    researchMenu.style.display = 'none';
  }

  refreshEjectButton(client, entities);
}

// Show only the selected building's research; disable already-done / in-progress ones.
function refreshResearchButtons(b, client, config, state) {
  const allowed = new Set(config.building[b.kind].researches);
  const research = state.players[client.playerId]?.research;
  const done = new Set(research?.done || []);
  const pending = new Set(research?.pending || []);
  document.querySelectorAll('#research-menu button').forEach(btn => {
    const id = btn.dataset.research;
    if (!allowed.has(id)) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.disabled = done.has(id) || pending.has(id);
  });
}

export function refreshEjectButton(client, entities) {
  const btn = document.getElementById('eject-button');
  if (!btn) return;
  const s = client.selectedIds.length === 1 ? entities.byId(client.selectedIds[0]) : null;
  const show = s && s.type === 'building' && s.kind === 'tower' && s.owner === client.playerId && s.garrisonIds && s.garrisonIds.length > 0;
  btn.style.display = show ? '' : 'none';
}
