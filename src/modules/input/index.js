// PUBLIC API of the input module.
// Owns the canvas listeners and HUD button bindings, exposes the drag-rect for render to draw.
//
// All in-game actions (orders, builds, training, tower eject) and sim-affecting
// settings (alwaysHit, supplyPriority) are submitted as commands via
// `transport.submit(...)`. This module never mutates sim state directly — only
// client-local UI state (selection, build-mode, hover, stackMode) is set inline.
//
// Selection/buildMode/trainFromId/hoverTile/stackMode live on clientState. The
// alwaysHit / supplyPriority toggles go through a `setOption` command so they
// land in the deterministic command stream (replay-safe; no MP desync). aiType
// stays a direct write — it only picks which AI emits commands, and those
// commands are themselves recorded.

import { bindMouse } from './mouse.js';
import { createKeyboard } from './keyboard.js';

/**
 * @typedef {Object} InputModule
 * @property {() => void} initInput
 * @property {() => void} refreshBuildButtons
 * @property {() => void} refreshTrainMenu
 * @property {() => ({x:number,y:number,w:number,h:number}|null)} getDragRect
 *   For render: the active drag-select rectangle, or null when not dragging.
 * @property {(dt:number) => void} tickPan
 *   Per-frame: applies held-key + edge-scroll camera pan. Called from the RAF loop.
 */

/**
 * @param {{
 *   state:        import('../../core/game-state.js').GameState,
 *   client:       import('../../client/client-state.js').ClientState,
 *   config:       import('../../core/config.js').GameConfig,
 *   map:          import('../map/index.js').MapModule,
 *   entities:     import('../entities/index.js').EntitiesModule,
 *   units:        import('../units/index.js').UnitsModule,
 *   pathfinding:  import('../pathfinding/index.js').Pathfinding,
 *   transport:    import('../../transport/local.js').Transport,
 *   isMP?:        boolean,
 *   onRestart?:   () => void,
 * }} deps
 * @returns {InputModule}
 */
export function createInput({ state, client, config, map, entities, units, pathfinding, transport, isMP, onRestart }) {
  const mouse = { x: 0, y: 0, dragStart: null, dragRect: null };
  const deps = { state, client, config, map, entities, units, pathfinding, transport };
  const keyboard = createKeyboard(client);
  /** @type {{tickPan:(dt:number)=>void}|null} */
  let mouseHandlers = null;

  function refreshBuildButtons() {
    document.querySelectorAll('#build-menu button').forEach(btn => {
      btn.classList.toggle('active', !!client.buildMode && client.buildMode.kind === btn.dataset.build);
    });
  }

  // Refresh the per-selection building menus (train + research) and the eject button.
  // Public name kept as `refreshTrainMenu` for callers; it now covers research too.
  function refreshTrainMenu() {
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
      refreshResearchButtons(s);
      researchMenu.style.display = '';
    } else if (researchMenu) {
      researchMenu.style.display = 'none';
    }

    refreshEjectButton();
  }

  // Show only the selected building's research; disable already-done / in-progress ones.
  function refreshResearchButtons(b) {
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

  function refreshEjectButton() {
    const btn = document.getElementById('eject-button');
    if (!btn) return;
    const s = client.selectedIds.length === 1 ? entities.byId(client.selectedIds[0]) : null;
    const show = s && s.type === 'building' && s.kind === 'tower' && s.owner === client.playerId && s.garrisonIds && s.garrisonIds.length > 0;
    btn.style.display = show ? '' : 'none';
  }

  function initInput() {
    const canvas = document.getElementById('canvas');
    mouseHandlers = bindMouse(canvas, mouse, deps, refreshTrainMenu);
    keyboard.init();

    document.querySelectorAll('#build-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.build;
        if (kind === 'cancel') client.buildMode = null;
        else                   client.buildMode = { kind };
        refreshBuildButtons();
      });
    });

    document.querySelectorAll('#train-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.train;
        const b = client.trainFromId != null ? entities.byId(client.trainFromId) : null;
        if (!b || b.hp <= 0) return;
        transport.submit({
          type: 'train', playerId: client.playerId,
          buildingId: b.id, unitKind: kind,
        });
      });
    });

    document.querySelectorAll('#research-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const researchId = btn.dataset.research;
        const b = client.researchFromId != null ? entities.byId(client.researchFromId) : null;
        if (!b || b.hp <= 0) return;
        transport.submit({
          type: 'research', playerId: client.playerId,
          buildingId: b.id, researchId,
        });
        // Reflect the now-pending state on the next frame (post-drain).
        requestAnimationFrame(refreshTrainMenu);
      });
    });

    const alwaysHitEl = document.getElementById('always-hit');
    if (alwaysHitEl) {
      alwaysHitEl.checked = state.alwaysHit;
      alwaysHitEl.addEventListener('change', () => {
        transport.submit({
          type: 'setOption', playerId: client.playerId,
          key: 'alwaysHit', value: alwaysHitEl.checked,
        });
      });
    }

    // Red AI / Blue AI dropdowns — pick which AI (if any) drives each side.
    // In multiplayer the sim is human-vs-human, so the selectors are disabled.
    for (const side of ['red', 'blue']) {
      const aiEl = document.getElementById(`${side}-ai`);
      if (!aiEl) continue;
      aiEl.value = state.aiType[side];
      aiEl.addEventListener('change', () => { state.aiType[side] = aiEl.value; });
      if (isMP) aiEl.disabled = true;
    }

    const stackModeEl = document.getElementById('stack-mode');
    if (stackModeEl) {
      stackModeEl.value = client.stackMode;
      stackModeEl.addEventListener('change', () => { client.stackMode = stackModeEl.value; });
    }

    const supplyEl = document.getElementById('supply-priority');
    if (supplyEl) {
      supplyEl.value = state.supplyPriority;
      supplyEl.addEventListener('change', () => {
        transport.submit({
          type: 'setOption', playerId: client.playerId,
          key: 'supplyPriority', value: supplyEl.value,
        });
      });
    }

    if (onRestart) {
      document.getElementById('restart').addEventListener('click', onRestart);
    }

    const ejectBtn = document.getElementById('eject-button');
    if (ejectBtn) {
      ejectBtn.addEventListener('click', () => {
        const s = client.selectedIds.length === 1 ? entities.byId(client.selectedIds[0]) : null;
        if (!s || s.type !== 'building' || s.kind !== 'tower' || s.owner !== client.playerId) return;
        transport.submit({ type: 'eject', playerId: client.playerId, buildingId: s.id });
        // Refresh on next animation frame so the post-drain garrison count is reflected.
        requestAnimationFrame(refreshEjectButton);
      });
    }
  }

  function tickPan(dt) {
    keyboard.tickPan(dt);
    if (mouseHandlers) mouseHandlers.tickPan(dt);
  }

  return {
    initInput,
    refreshBuildButtons,
    refreshTrainMenu,
    getDragRect: () => mouse.dragRect,
    tickPan,
  };
}
