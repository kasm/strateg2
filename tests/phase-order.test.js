// P9 — Phase order as data.
// PHASES (in src/core/game-loop.js) is the single source of truth for tick ordering.
// These tests assert: shape, declared order (snapshotted), call-order at runtime, and
// the post-conditions documented on each phase's @phase JSDoc.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';
import { tick, TICK_DT, PHASES } from '../src/core/game-loop.js';

function freshWorld() {
  const w = createWorld(CONFIG);
  w.entities.spawnInitial();
  w.ai.resetAI();
  return w;
}

describe('tick PHASES — shape and declared order', () => {
  it('PHASES is a non-empty array of {name, fn}', () => {
    expect(Array.isArray(PHASES)).toBe(true);
    expect(PHASES.length).toBeGreaterThan(0);
    for (const p of PHASES) {
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(typeof p.fn).toBe('function');
    }
  });

  it('canonical phase names (snapshot — fail = somebody reordered)', () => {
    expect(PHASES.map(p => p.name)).toMatchInlineSnapshot(`
      [
        "drainCommands",
        "advanceTick",
        "aiUpdate",
        "unitsUpdate",
        "projectiles",
        "buildings",
        "pruneDead",
        "victoryCheck",
      ]
    `);
  });

  it('phase names are unique', () => {
    const names = PHASES.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('tick() — runtime call order matches PHASES', () => {
  // Wrap each phase fn with a logger, restore after each test. PHASES is `const` but
  // its slots are mutable; tick() reads PHASES[i].fn at call time so wrapping works.
  let log;
  let originals;

  beforeEach(() => {
    log = [];
    originals = PHASES.map((p, i) => {
      const orig = p.fn;
      PHASES[i] = { ...p, fn: (w, dt) => { log.push(p.name); return orig(w, dt); } };
      return { i, orig, name: p.name };
    });
  });

  afterEach(() => {
    for (const { i, orig, name } of originals) PHASES[i] = { name, fn: orig };
  });

  it('on a live tick, all phases fire in declared order exactly once', () => {
    const w = freshWorld();
    tick(w, TICK_DT);
    expect(log).toEqual(PHASES.map(p => p.name));
  });

  it('on a gameOver tick, only drainCommands runs (rest are skipped)', () => {
    const w = freshWorld();
    w.state.gameOver = 'red';   // simulate previously decided victory
    log.length = 0;
    tick(w, TICK_DT);
    expect(log).toEqual(['drainCommands']);
  });
});

describe('tick() — per-phase post-conditions', () => {
  it('advanceTick: state.tick increments by exactly 1 per live tick', () => {
    const w = freshWorld();
    const t0 = w.state.tick;
    tick(w, TICK_DT);
    expect(w.state.tick).toBe(t0 + 1);
    tick(w, TICK_DT);
    expect(w.state.tick).toBe(t0 + 2);
  });

  it('advanceTick: state.tick does NOT increment on a gameOver tick', () => {
    const w = freshWorld();
    w.state.gameOver = 'blue';
    const t0 = w.state.tick;
    tick(w, TICK_DT);
    expect(w.state.tick).toBe(t0);
  });

  it('drainCommands: pre-tick queue is empty after drain (AI off, no new submits)', () => {
    const w = freshWorld();
    // Disable AI — otherwise aiUpdate submits new commands within the same tick
    // that drainCommands has already finished. Those are *next* tick's input.
    w.state.aiType.red  = 'off';
    w.state.aiType.blue = 'off';
    // A deliberately-invalid order: enters the queue via submit(), is dropped at
    // validate() time inside drain(). Either way, pendingCount should be 0 after.
    w.commands.submit({ type: 'order', playerId: 'red', unitIds: [], target: { kind: 'tile', x: 0, y: 0 } });
    expect(w.commands.pendingCount()).toBeGreaterThan(0);
    tick(w, TICK_DT);
    expect(w.commands.pendingCount()).toBe(0);
  });

  it('pruneDead: no surviving entity has hp <= 0 after a tick', () => {
    const w = freshWorld();
    const victim = w.state.entities.find(e => e.type === 'unit');
    expect(victim).toBeDefined();
    victim.hp = 0;
    tick(w, TICK_DT);
    for (const e of w.state.entities) expect(e.hp).toBeGreaterThan(0);
  });
});
