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
import {
  refreshBuildButtons as refreshBuildButtonsImpl,
  refreshTrainMenu as refreshTrainMenuImpl,
} from './refresh.internal.js';
import { bindHudButtons } from './hud-bindings.internal.js';

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

  const refreshBuildButtons = () => refreshBuildButtonsImpl(client);
  const refreshTrainMenu    = () => refreshTrainMenuImpl(client, entities, config, state);
  const refresh = { refreshBuildButtons, refreshTrainMenu };

  function initInput() {
    const canvas = document.getElementById('canvas');
    mouseHandlers = bindMouse(canvas, mouse, deps, refreshTrainMenu);
    keyboard.init();
    bindHudButtons({ client, state, entities, transport, refresh, onRestart, isMP });
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
