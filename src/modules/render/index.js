// PUBLIC API of the render module. Owns the canvas 2D context and the per-frame draw.

import { drawScene } from './scene.js';
import { updateHUD } from './hud.js';
import { resolveSelected } from '../../client/client-state.js';

/**
 * @typedef {Object} RenderModule
 * @property {() => void} initRender    - acquire the canvas 2D context.
 * @property {() => void} draw          - render one frame (scene + HUD).
 */

/**
 * @param {{
 *   state:    import('../../core/game-state.js').GameState,
 *   client:   import('../../client/client-state.js').ClientState,
 *   config:   import('../../core/config.js').GameConfig,
 *   map:      import('../map/index.js').MapModule,
 *   entities: import('../entities/index.js').EntitiesModule,
 *   getDragRect?: () => ({x:number,y:number,w:number,h:number}|null),
 * }} deps
 * @returns {RenderModule}
 */
export function createRender({ state, client, config, map, entities, getDragRect }) {
  let ctx = null;
  return {
    initRender() {
      const canvas = document.getElementById('canvas');
      ctx = canvas.getContext('2d');
    },
    draw() {
      if (!ctx) return;
      // Prune dead/missing entities from the selection once per frame; passes the live
      // entity set + a Set<id> for fast contains-checks into scene/sprites.
      const selectedLive = resolveSelected(client, entities);
      const selectedIdSet = new Set(client.selectedIds);
      drawScene(ctx, { state, client, config, map, getDragRect, selectedIdSet });
      updateHUD(state, client, config, entities, selectedLive);
    },
  };
}
