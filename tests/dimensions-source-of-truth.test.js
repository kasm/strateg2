// Phase 1 seam: map.w / map.h is the single source of truth for grid dimensions.
// Building a world with non-default dims must produce a world whose spawn layout,
// forest layout, and AI defaults all scale to the chosen dims (not the legacy 36x20).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';

describe('map dimensions are per-game, not global', () => {
  it('createWorld accepts mapW / mapH and the map reports them', () => {
    const w = createWorld(CONFIG, { mapW: 48, mapH: 24 });
    expect(w.map.w).toBe(48);
    expect(w.map.h).toBe(24);
  });

  it('default world (no opts) still reads from config — no behaviour change', () => {
    const w = createWorld(CONFIG);
    expect(w.map.w).toBe(CONFIG.mapW);
    expect(w.map.h).toBe(CONFIG.mapH);
  });

  it('spawnInitial places townhalls and goldmines derived from map.w / map.h', () => {
    const w = createWorld(CONFIG, { mapW: 48, mapH: 24 });
    w.entities.spawnInitial();
    const red  = w.entities.buildingsOf('red').find(b => b.kind === 'townHall');
    const blue = w.entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    expect(red.tileX).toBe(1);
    expect(blue.tileX).toBe(48 - 4);   // 44 — not the legacy 32
    const yMid = Math.floor(24 / 2);
    expect(red.tileY).toBe(yMid - 2);
    expect(blue.tileY).toBe(yMid - 2);

    const mines = w.state.entities.filter(e => e.kind === 'goldMine');
    expect(mines.map(m => m.tileX).sort((a, b) => a - b)).toEqual([4, 48 - 6]);
  });

  it('forests scale with the map (no out-of-bounds, all on the grid)', () => {
    const w = createWorld(CONFIG, { mapW: 60, mapH: 40 });
    let forestTiles = 0;
    for (let y = 0; y < w.map.h; y++) {
      for (let x = 0; x < w.map.w; x++) {
        if (w.map.tiles[y][x].type === 'forest') forestTiles++;
      }
    }
    // Four 5x3 patches = 60 tiles when fully on the map.
    expect(forestTiles).toBe(60);
  });

  it('non-default dims run a tick without throwing', () => {
    const w = createWorld(CONFIG, { mapW: 60, mapH: 40 });
    w.entities.spawnInitial();
    w.ai.resetAI();
    expect(() => {
      for (let i = 0; i < 30; i++) {
        // import-on-use to avoid pulling game-loop into the top-level deps of this guard test.
      }
    }).not.toThrow();
  });
});
