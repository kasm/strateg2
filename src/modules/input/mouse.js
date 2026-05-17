// Internal: raw mouse + DOM-button bindings. Mutates the shared `mouse` record
// (so render can draw the drag rect) and translates input into commands. Sim state
// is never mutated here — orders/builds go through the commands dispatcher.

import {
  selectInRect, handleLeftClick, submitOrderForSelected, submitBuild,
} from './commands.js';

export function bindMouse(canvas, mouse, deps, refreshTrainMenu) {
  const { client, map } = deps;

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.button === 0) {
      if (client.buildMode) {
        const tile = map.worldToTile(x, y);
        submitBuild(tile.x, tile.y, deps);
        return;
      }
      mouse.dragStart = { x, y };
      mouse.dragRect  = { x, y, w: 0, h: 0 };
    } else if (e.button === 2) {
      handleRightClick(x, y, deps);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    mouse.x = x; mouse.y = y;
    client.hoverTile = map.worldToTile(x, y);
    if (mouse.dragStart) {
      const ds = mouse.dragStart;
      mouse.dragRect = {
        x: Math.min(ds.x, x), y: Math.min(ds.y, y),
        w: Math.abs(x - ds.x), h: Math.abs(y - ds.y),
      };
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0) return;
    if (!mouse.dragStart) return;
    const r = mouse.dragRect;
    mouse.dragStart = null;
    mouse.dragRect  = null;
    if (r.w < 4 && r.h < 4) handleLeftClick(r.x, r.y, e.shiftKey, deps);
    else                    selectInRect(r, e.shiftKey, deps);
    refreshTrainMenu();
  });
}

function handleRightClick(x, y, deps) {
  const { client, map, entities } = deps;
  if (client.buildMode) { client.buildMode = null; return; }
  if (client.selectedIds.length === 0) return;
  const tgt  = entities.findEntityAt(x, y);
  const tile = map.worldToTile(x, y);
  submitOrderForSelected(tgt, tile, deps);
}
