// Camera seam: verifies the screen-px <-> world-px <-> tile transforms compose
// correctly under pan and zoom, and that the camera clamps to the map bounds.
// Pure unit test — no DOM, no canvas.

import { describe, it, expect } from 'vitest';
import { createCamera, ZOOM_LEVELS } from '../src/client/camera.js';

const CW = 1152, CH = 640, SIM_TILE = 32;

describe('camera transforms', () => {
  it('at default state, screen-px == world-px', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(36, 20);
    expect(cam.screenToWorldPx(0, 0)).toEqual({ x: 0, y: 0 });
    expect(cam.screenToWorldPx(100, 200)).toEqual({ x: 100, y: 200 });
    expect(cam.worldPxToScreen(64, 64)).toEqual({ x: 64, y: 64 });
  });

  it('screenToTile is camera-aware', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(60, 40);
    cam.pan(5, 3);
    expect(cam.screenToTile(0, 0)).toEqual({ x: 5, y: 3 });
    // 32 screen-px at tilePx=32 = 1 tile right of the camera origin.
    expect(cam.screenToTile(32, 32)).toEqual({ x: 6, y: 4 });
  });

  it('zoom changes the visible tile count', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(128, 80);
    expect(cam.visibleTiles()).toEqual({ w: CW / 32, h: CH / 32 });
    cam.setZoom(64);
    expect(cam.visibleTiles()).toEqual({ w: CW / 64, h: CH / 64 });
    cam.setZoom(16);
    expect(cam.visibleTiles()).toEqual({ w: CW / 16, h: CH / 16 });
  });

  it('screen <-> world round-trip at non-default zoom', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(128, 80);
    cam.setZoom(48);
    cam.pan(10, 6);
    const sp = { x: 100, y: 50 };
    const wp = cam.screenToWorldPx(sp.x, sp.y);
    const back = cam.worldPxToScreen(wp.x, wp.y);
    expect(back.x).toBeCloseTo(sp.x);
    expect(back.y).toBeCloseTo(sp.y);
  });

  it('centerOnTile centers the viewport and clamps', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(60, 40);
    cam.centerOnTile(30, 20);
    const vis = cam.visibleTiles();
    expect(cam.tileX).toBeCloseTo(30 - vis.w / 2);
    expect(cam.tileY).toBeCloseTo(20 - vis.h / 2);
    // Clamp at top-left.
    cam.centerOnTile(-10, -10);
    expect(cam.tileX).toBe(0);
    expect(cam.tileY).toBe(0);
    // Clamp at bottom-right.
    cam.centerOnTile(1000, 1000);
    expect(cam.tileX).toBe(Math.max(0, 60 - vis.w));
    expect(cam.tileY).toBe(Math.max(0, 40 - vis.h));
  });

  it('clamps to (0,0) when the map fits the canvas', () => {
    const cam = createCamera({ canvasW: CW, canvasH: CH, simTile: SIM_TILE });
    cam.setMap(36, 20); // exactly fits the canvas at zoom 32
    cam.pan(5, 5);
    expect(cam.tileX).toBe(0);
    expect(cam.tileY).toBe(0);
  });

  it('exposes ZOOM_LEVELS including the sim tile size as a default-friendly entry', () => {
    expect(ZOOM_LEVELS).toContain(SIM_TILE);
  });
});
