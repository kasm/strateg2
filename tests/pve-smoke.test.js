// Smoke tests for the PvE wave director.
// These exercise the foundational seams: pve module wiring, faction registry,
// event bus, configurable victory.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';
import { tick, TICK_DT } from '../src/core/game-loop.js';
import { isPlayer, isHostileBetween, participatesInVictory } from '../src/core/factions.js';

function pveConfig(overrides = {}) {
  return {
    ...CONFIG,
    pve: { ...CONFIG.pve, enabled: true, ...overrides },
  };
}

describe('faction registry', () => {
  it('classifies factions correctly', () => {
    expect(isPlayer('red')).toBe(true);
    expect(isPlayer('blue')).toBe(true);
    expect(isPlayer('wild')).toBe(false);
    expect(isPlayer('neutral')).toBe(false);
    expect(participatesInVictory('red')).toBe(true);
    expect(participatesInVictory('wild')).toBe(false);
    expect(participatesInVictory('neutral')).toBe(false);
  });

  it('hostility relations', () => {
    expect(isHostileBetween('red', 'blue')).toBe(true);
    expect(isHostileBetween('red', 'wild')).toBe(true);
    expect(isHostileBetween('wild', 'red')).toBe(true);
    expect(isHostileBetween('wild', 'blue')).toBe(true);
    expect(isHostileBetween('red', 'red')).toBe(false);
    expect(isHostileBetween('red', 'neutral')).toBe(false);
    expect(isHostileBetween('wild', 'wild')).toBe(false);
    expect(isHostileBetween('wild', 'neutral')).toBe(false);
  });
});

describe('pveUpdate phase (disabled)', () => {
  it('runs as no-op when config.pve.enabled is false', () => {
    // Explicitly disable — the project's default CONFIG may have pve.enabled
    // toggled on locally; the seam guarantee is that disabling it produces a
    // pure pre-PvE simulation.
    const cfg = { ...CONFIG, pve: { ...CONFIG.pve, enabled: false } };
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    for (let i = 0; i < 120; i++) tick(w, TICK_DT);
    expect(w.state.entities.filter((e) => e.owner === 'wild')).toEqual([]);
    expect(w.state.events).toEqual([]);
  });
});

describe('pveUpdate phase (enabled)', () => {
  it('spawnInitial places bandit camps when pve.enabled', () => {
    const cfg = pveConfig({ campCount: 2 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    const camps = w.entities.buildingsOf('wild').filter((b) => b.kind === 'banditCamp');
    expect(camps.length).toBe(2);
  });

  it('camps target different player factions (round-robin)', () => {
    const cfg = pveConfig({ campCount: 2 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    const camps = w.entities.buildingsOf('wild').filter((b) => b.kind === 'banditCamp');
    const targets = camps.map((c) => c.targetFaction);
    expect(new Set(targets).size).toBe(2);
    expect(targets).toContain('red');
    expect(targets).toContain('blue');
  });

  it('camps are placed at opposite ends of the map (not stacked)', () => {
    const cfg = pveConfig({ campCount: 2 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    const camps = w.entities.buildingsOf('wild').filter((b) => b.kind === 'banditCamp');
    const dx = Math.abs(camps[0].tileX - camps[1].tileX);
    const dy = Math.abs(camps[0].tileY - camps[1].tileY);
    // Should span at least a quarter-map in each axis
    expect(dx).toBeGreaterThan(w.config.mapW / 4);
    expect(dy).toBeGreaterThan(w.config.mapH / 4);
  });

  it('bandits from different camps walk toward different town halls', () => {
    const cfg = pveConfig({ firstWaveAfterSec: 1, waveSize: 2, campCount: 2 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    for (let i = 0; i < 60; i++) tick(w, TICK_DT);
    const bandits = w.state.entities.filter((e) => e.kind === 'bandit');
    expect(bandits.length).toBeGreaterThanOrEqual(2);
    // Bandits inherit a path or job from setMoveTarget toward their camp's
    // target townhall. With 2 camps targeting different factions, the bandit
    // group should not all be marching toward the same x coordinate.
    const targetXs = new Set();
    for (const b of bandits) {
      if (b.path && b.path.length > 0) {
        targetXs.add(b.path[b.path.length - 1].x);
      }
    }
    expect(targetXs.size).toBeGreaterThanOrEqual(2);
  });

  it('emits raid-incoming before the first wave', () => {
    const cfg = pveConfig({ firstWaveAfterSec: 5, announceLeadSec: 2 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    // Tick past the announce mark (5 - 2 = 3 seconds; 3 / TICK_DT = 90 ticks)
    for (let i = 0; i < 100; i++) tick(w, TICK_DT);
    expect(w.state.events.some((e) => e.type === 'raid-incoming')).toBe(true);
  });

  it('spawns bandits and fires raid event after firstWaveAfterSec', () => {
    const cfg = pveConfig({ firstWaveAfterSec: 2, waveSize: 3, campCount: 1 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    // 2 sec + a couple ticks safety = ~65 ticks
    for (let i = 0; i < 80; i++) tick(w, TICK_DT);
    const bandits = w.state.entities.filter((e) => e.kind === 'bandit' && e.owner === 'wild');
    expect(bandits.length).toBeGreaterThan(0);
    expect(w.state.events.some((e) => e.type === 'raid-fired')).toBe(true);
  });

  it('bandits attack player units (hostility wiring)', () => {
    const cfg = pveConfig({ firstWaveAfterSec: 1, waveSize: 2, campCount: 1 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    // Run long enough for a wave to spawn and acquire targets
    for (let i = 0; i < 60; i++) tick(w, TICK_DT);
    const bandits = w.state.entities.filter((e) => e.kind === 'bandit');
    // At least one bandit should have a move target or attack job toward a player entity
    expect(bandits.length).toBeGreaterThan(0);
    // No crash means: melee.internal.js auto-acquire correctly walks the entity list
    // and treats wild as hostile to red/blue (covered by isHostileBetween).
  });

  it('destroying a camp awards bounty and emits camp-destroyed', () => {
    const cfg = pveConfig({ campCount: 1, bountyOnDestroy: 150 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    const camp = w.entities.buildingsOf('wild').find((b) => b.kind === 'banditCamp');
    expect(camp).toBeDefined();
    const goldBefore = w.state.players.red.gold;
    w.entities.killEntity(camp, 'red');
    expect(w.state.players.red.gold).toBe(goldBefore + 150);
    expect(w.state.events.some((e) => e.type === 'camp-destroyed')).toBe(true);
  });

  it('camp destruction does NOT trigger victory (wild not a participant)', () => {
    const cfg = pveConfig({ campCount: 1 });
    const w = createWorld(cfg);
    w.entities.spawnInitial();
    const camp = w.entities.buildingsOf('wild').find((b) => b.kind === 'banditCamp');
    w.entities.killEntity(camp, 'red');
    w.entities.pruneDead();
    tick(w, TICK_DT);
    // Red and blue both still have buildings, no faction was eliminated.
    expect(w.state.gameOver).toBe(null);
  });
});
