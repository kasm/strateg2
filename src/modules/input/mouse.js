// Internal: raw mouse + DOM-button bindings. Mutates the shared `mouse` record
// (so render can draw the drag rect) and translates input into commands. Sim state
// is never mutated here — orders/builds go through the commands dispatcher.
//
// Coordinate handling: MouseEvent coords are SCREEN-PX (canvas-relative). The drag
// rectangle is kept in screen-px because render draws it as a raw HUD overlay. For
// any sim-facing operation (entity hit-test, selection, tile lookup) we go through
// `client.camera` to convert into the sim's world-px / tile space.
//
// This module also owns camera-pan / zoom inputs that originate on the canvas:
// wheel zoom (centered on the cursor), middle-click drag pan, and edge scrolling.
// Keyboard pan/zoom lives in input/keyboard.js.

import {
  selectInRect, handleLeftClick, submitOrderForSelected, submitBuild,
} from './commands.js';
import { ZOOM_LEVELS } from '../../client/camera.js';

const EDGE_SCROLL_BAND  = 24;  // px from the canvas edge to start scrolling
const EDGE_SCROLL_SPEED = 30;  // tiles per second at the very edge

export function bindMouse(canvas, mouse, deps, refreshTrainMenu) {
  const { client } = deps;

  // Pan-drag state (middle-mouse button). Mutually exclusive with left-drag
  // (drag-select); the canvas events themselves enforce this by button code.
  let panDrag = null; // { lastSx, lastSy } or null
  // Edge-scroll velocity in tiles/sec, recomputed from cursor position each
  // mousemove. tickPan() applies it.
  let edgeVx = 0, edgeVy = 0;
  // Track cursor presence so we don't auto-scroll when the mouse leaves.
  let onCanvas = false;

  function updateEdgeScroll(sx, sy) {
    if (!onCanvas) { edgeVx = 0; edgeVy = 0; return; }
    const w = canvas.width, h = canvas.height;
    let vx = 0, vy = 0;
    if (sx < EDGE_SCROLL_BAND)            vx = -(1 - sx / EDGE_SCROLL_BAND);
    else if (sx > w - EDGE_SCROLL_BAND)   vx =  (1 - (w - sx) / EDGE_SCROLL_BAND);
    if (sy < EDGE_SCROLL_BAND)            vy = -(1 - sy / EDGE_SCROLL_BAND);
    else if (sy > h - EDGE_SCROLL_BAND)   vy =  (1 - (h - sy) / EDGE_SCROLL_BAND);
    edgeVx = vx * EDGE_SCROLL_SPEED;
    edgeVy = vy * EDGE_SCROLL_SPEED;
  }

  function zoomTowardCursor(dir, sx, sy) {
    const cam = client.camera;
    const idx = ZOOM_LEVELS.indexOf(cam.tilePx);
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir))];
    if (next === cam.tilePx) return;
    const before = cam.screenToTile(sx, sy);
    cam.setZoom(next);
    const after = cam.screenToTile(sx, sy);
    cam.pan(before.x - after.x, before.y - after.y);
  }

  canvas.addEventListener('contextmenu', e => e.preventDefault());

  canvas.addEventListener('mouseenter', () => { onCanvas = true; });
  canvas.addEventListener('mouseleave', () => {
    onCanvas = false;
    edgeVx = 0; edgeVy = 0;
  });

  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (e.button === 0) {
      if (client.buildMode) {
        const tile = client.camera.screenToTile(sx, sy);
        submitBuild(tile.x, tile.y, deps);
        return;
      }
      mouse.dragStart = { x: sx, y: sy };
      mouse.dragRect  = { x: sx, y: sy, w: 0, h: 0 };
    } else if (e.button === 1) {
      e.preventDefault();
      panDrag = { lastSx: sx, lastSy: sy };
    } else if (e.button === 2) {
      handleRightClick(sx, sy, deps);
    }
  });

  canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    mouse.x = sx; mouse.y = sy;
    client.hoverTile = client.camera.screenToTile(sx, sy);
    if (panDrag) {
      const dx = sx - panDrag.lastSx, dy = sy - panDrag.lastSy;
      // Translate screen-px delta to tile delta via the camera scale.
      client.camera.pan(-dx / client.camera.tilePx, -dy / client.camera.tilePx);
      panDrag.lastSx = sx; panDrag.lastSy = sy;
    }
    if (mouse.dragStart) {
      const ds = mouse.dragStart;
      mouse.dragRect = {
        x: Math.min(ds.x, sx), y: Math.min(ds.y, sy),
        w: Math.abs(sx - ds.x), h: Math.abs(sy - ds.y),
      };
    }
    updateEdgeScroll(sx, sy);
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button === 1) {
      panDrag = null;
      return;
    }
    if (e.button !== 0) return;
    if (!mouse.dragStart) return;
    const r = mouse.dragRect;
    mouse.dragStart = null;
    mouse.dragRect  = null;
    if (r.w < 4 && r.h < 4) {
      const wp = client.camera.screenToWorldPx(r.x, r.y);
      handleLeftClick(wp.x, wp.y, e.shiftKey, deps);
    } else {
      const tl = client.camera.screenToWorldPx(r.x, r.y);
      const br = client.camera.screenToWorldPx(r.x + r.w, r.y + r.h);
      const worldRect = { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      selectInRect(worldRect, e.shiftKey, deps);
    }
    refreshTrainMenu();
  });

  // Wheel zoom — centered on the cursor so the tile under the cursor stays put.
  // Skip while dragging anything (drag-select or pan-drag) so wheel isn't
  // accidentally captured during a multi-step interaction.
  canvas.addEventListener('wheel', e => {
    if (mouse.dragStart || panDrag) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    zoomTowardCursor(e.deltaY < 0 ? 1 : -1, sx, sy);
  }, { passive: false });

  function tickPan(dt) {
    // Edge scrolling is suspended while the user is actively dragging.
    if (mouse.dragStart || panDrag) return;
    if (edgeVx === 0 && edgeVy === 0) return;
    client.camera.pan(edgeVx * dt, edgeVy * dt);
  }

  return { tickPan };
}

function handleRightClick(sx, sy, deps) {
  const { client, entities } = deps;
  if (client.buildMode) { client.buildMode = null; return; }
  if (client.selectedIds.length === 0) return;
  const wp   = client.camera.screenToWorldPx(sx, sy);
  const tgt  = entities.findEntityAt(wp.x, wp.y);
  const tile = client.camera.screenToTile(sx, sy);
  submitOrderForSelected(tgt, tile, deps);
}
