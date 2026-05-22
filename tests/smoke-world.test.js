import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';
import { tick, TICK_DT } from '../src/core/game-loop.js';

// End-to-end smoke: createWorld should wire every module, spawnInitial should populate
// the entity list, and a few ticks of the loop should run without throwing.
// We skip render.initRender() and input.initInput() since they touch the DOM.

describe('world + game-loop smoke', () => {
  it('createWorld returns the full module graph', () => {
    const w = createWorld(CONFIG);
    expect(Object.keys(w).sort()).toEqual([
      'ai', 'combat', 'commands', 'config', 'entities', 'map',
      'pathfinding', 'recorder', 'state', 'units',
    ]);
  });

  it('runs many ticks after spawnInitial without throwing', () => {
    const w = createWorld(CONFIG);
    w.entities.spawnInitial();
    w.ai.resetAI();
    expect(() => {
      for (let i = 0; i < 600; i++) tick(w, TICK_DT); // ~20 simulated seconds
    }).not.toThrow();
    // Entities should still exist (game shouldn't have ended in 20 s of pure AI).
    expect(w.state.entities.length).toBeGreaterThan(0);
  });

  it('sets gameOver when one side has no non-goldmine buildings', () => {
    const w = createWorld(CONFIG);
    w.entities.spawnInitial();
    // Kill all red non-goldmine buildings to simulate blue's victory.
    for (const b of w.entities.buildingsOf('red')) {
      if (b.kind !== 'goldMine') w.entities.killEntity(b);
    }
    w.entities.pruneDead();
    tick(w, TICK_DT);
    expect(w.state.gameOver).toBe('blue');
  });
});
