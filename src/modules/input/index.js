// PUBLIC API of the input module.
// Owns the canvas listeners and HUD button bindings, exposes the drag-rect for render to draw.

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
 *   config:       import('../../core/config.js').GameConfig,
 *   map:          import('../map/index.js').MapModule,
 *   entities:     import('../entities/index.js').EntitiesModule,
 *   units:        import('../units/index.js').UnitsModule,
 *   pathfinding:  import('../pathfinding/index.js').Pathfinding,
 *   onRestart?:   () => void,
 * }} deps
 * @returns {InputModule}
 */
export function createInput({ state, config, map, entities, units, pathfinding, onRestart }) {
  const mouse = { x: 0, y: 0, dragStart: null, dragRect: null };
  const deps = { state, config, map, entities, units, pathfinding };

  function refreshBuildButtons() {
    document.querySelectorAll('#build-menu button').forEach(btn => {
      btn.classList.toggle('active', !!state.buildMode && state.buildMode.kind === btn.dataset.build);
    });
  }

  function refreshTrainMenu() {
    const menu = document.getElementById('train-menu');
    state.trainFrom = null;
    if (state.selected.length === 1) {
      const s = state.selected[0];
      if (s.type === 'building' && s.owner === 'red' && config.building[s.kind].trains.length) {
        state.trainFrom = s;
        const allowed = new Set(config.building[s.kind].trains);
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

  function initInput() {
    const canvas = document.getElementById('canvas');
    bindMouse(canvas, mouse, deps, refreshTrainMenu);

    document.querySelectorAll('#build-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.build;
        if (kind === 'cancel') state.buildMode = null;
        else                   state.buildMode = { kind };
        refreshBuildButtons();
      });
    });

    document.querySelectorAll('#train-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.train;
        const b = state.trainFrom;
        if (!b || b.hp <= 0) return;
        const def = config.unit[kind];
        const me = state.players.red;
        if (me.gold < def.cost.gold) return;
        me.gold -= def.cost.gold;
        b.trainQueue.push(kind);
      });
    });

    const alwaysHitEl = document.getElementById('always-hit');
    if (alwaysHitEl) {
      alwaysHitEl.checked = state.alwaysHit;
      alwaysHitEl.addEventListener('change', () => { state.alwaysHit = alwaysHitEl.checked; });
    }

    const stackModeEl = document.getElementById('stack-mode');
    if (stackModeEl) {
      stackModeEl.value = state.stackMode;
      stackModeEl.addEventListener('change', () => { state.stackMode = stackModeEl.value; });
    }

    if (onRestart) {
      document.getElementById('restart').addEventListener('click', onRestart);
    }
  }

  return {
    initInput,
    refreshBuildButtons,
    refreshTrainMenu,
    getDragRect: () => mouse.dragRect,
  };
}
