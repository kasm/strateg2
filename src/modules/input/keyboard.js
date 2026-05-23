// Keyboard pan + zoom bindings.
//
// Pan: WASD / arrow keys. Held-key state is tracked and applied per frame via
// `tickPan(dt)` so multiple keys can combine (NW = up + left) and motion is
// frame-rate independent.
//
// Zoom: `+` / `-` (and `=` / `_` so users don't need shift). Cycles through
// camera ZOOM_LEVELS; zoom centers on the screen mid-point.

import { ZOOM_LEVELS } from '../../client/camera.js';

const PAN_SPEED = 24; // tiles per second when a pan key is held

const PAN_KEYS = {
  'w': 'up',    'ArrowUp':    'up',
  's': 'down',  'ArrowDown':  'down',
  'a': 'left',  'ArrowLeft':  'left',
  'd': 'right', 'ArrowRight': 'right',
};

function isTextInputTarget(t) {
  if (!t || !t.tagName) return false;
  const tag = t.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * @param {import('../../client/client-state.js').ClientState} client
 */
export function createKeyboard(client) {
  /** @type {Set<'up'|'down'|'left'|'right'>} */
  const pressed = new Set();

  function step(camera, dir) {
    const idx = ZOOM_LEVELS.indexOf(camera.tilePx);
    const next = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir))];
    if (next === camera.tilePx) return;
    // Anchor zoom on screen-center so the user's focus point stays put.
    const sx = camera.canvasW / 2, sy = camera.canvasH / 2;
    const before = camera.screenToTile(sx, sy);
    camera.setZoom(next);
    const after = camera.screenToTile(sx, sy);
    camera.pan(before.x - after.x, before.y - after.y);
  }

  function onKeyDown(e) {
    if (isTextInputTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); step(client.camera,  1); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); step(client.camera, -1); return; }
    const dir = PAN_KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    pressed.add(dir);
  }

  function onKeyUp(e) {
    const dir = PAN_KEYS[e.key];
    if (!dir) return;
    pressed.delete(dir);
  }

  function init() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    // If the page loses focus mid-pan, releasing the key elsewhere wouldn't fire
    // keyup here — clear so the camera doesn't drift forever.
    window.addEventListener('blur', () => pressed.clear());
  }

  function tickPan(dt) {
    if (pressed.size === 0) return;
    let dx = 0, dy = 0;
    if (pressed.has('left'))  dx -= 1;
    if (pressed.has('right')) dx += 1;
    if (pressed.has('up'))    dy -= 1;
    if (pressed.has('down'))  dy += 1;
    if (dx === 0 && dy === 0) return;
    // Diagonal normalisation so NW isn't faster than N.
    const len = Math.hypot(dx, dy) || 1;
    client.camera.pan((dx / len) * PAN_SPEED * dt, (dy / len) * PAN_SPEED * dt);
  }

  return { init, tickPan };
}
