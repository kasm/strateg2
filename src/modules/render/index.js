// PUBLIC API of the render module. Owns the canvas 2D context and the per-frame draw.

import { drawScene } from './scene.js';
import { updateHUD } from './hud.js';

/**
 * @typedef {Object} RenderModule
 * @property {() => void} initRender    - acquire the canvas 2D context.
 * @property {() => void} draw          - render one frame (scene + HUD).
 */

/**
 * @param {{
 *   state:    import('../../core/game-state.js').GameState,
 *   config:   import('../../core/config.js').GameConfig,
 *   map:      import('../map/index.js').MapModule,
 *   entities: import('../entities/index.js').EntitiesModule,
 *   getDragRect?: () => ({x:number,y:number,w:number,h:number}|null),
 * }} deps
 * @returns {RenderModule}
 */
export function createRender({ state, config, map, entities, getDragRect }) {
  let ctx = null;
  return {
    initRender() {
      const canvas = document.getElementById('canvas');
      ctx = canvas.getContext('2d');
    },
    draw() {
      if (!ctx) return;
      drawScene(ctx, { state, config, map, getDragRect });
      updateHUD(state, config, entities);
    },
  };
}
