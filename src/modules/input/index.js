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

/**
 * @typedef {Object} InputModule
 * @property {() => void} initInput
 * @property {() => void} refreshBuildButtons
 * @property {() => void} refreshTrainMenu
 * @property {() => ({x:number,y:number,w:number,h:number}|null)} getDragRect
 *   For render: the active drag-select rectangle, or null when not dragging.
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

  function refreshBuildButtons() {
    document.querySelectorAll('#build-menu button').forEach(btn => {
      btn.classList.toggle('active', !!client.buildMode && client.buildMode.kind === btn.dataset.build);
    });
  }

  function refreshTrainMenu() {
    const menu = document.getElementById('train-menu');
    client.trainFromId = null;
    if (client.selectedIds.length === 1) {
      const s = entities.byId(client.selectedIds[0]);
      if (s && s.type === 'building' && s.owner === client.playerId && config.building[s.kind].trains.length) {
        client.trainFromId = s.id;
        const allowed = new Set(config.building[s.kind].trains);
        document.querySelectorAll('#train-menu button').forEach(btn => {
          btn.style.display = allowed.has(btn.dataset.train) ? '' : 'none';
        });
        document.getElementById('train-title').textContent = 'Train from ' + s.kind + ':';
        menu.style.display = '';
        refreshEjectButton();
        return;
      }
    }
    menu.style.display = 'none';
    refreshEjectButton();
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
    bindMouse(canvas, mouse, deps, refreshTrainMenu);

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

  return {
    initInput,
    refreshBuildButtons,
    refreshTrainMenu,
    getDragRect: () => mouse.dragRect,
  };
}
