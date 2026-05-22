// Functional coverage for the resource / research / upgrade seams:
//   - the player treasury is a generic resource bag
//   - economy.js canAfford/spend/refund operate over arbitrary cost maps
//   - the 'research' command queues, completes, and applies stat modifiers
//   - the effective-stats resolver reflects completed research per player
//   - unlock gating blocks build/train until prerequisites are researched

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';
import { tick, TICK_DT } from '../src/core/game-loop.js';
import { canAfford, spend, refund, seedTreasury } from '../src/core/economy.js';
import { unitStat } from '../src/core/stats.js';
import { isUnlocked } from '../src/core/research.js';
import { validateTrain } from '../src/commands/train.js';

function fresh() {
  const w = createWorld(CONFIG);
  w.entities.spawnInitial();
  return w;
}

/** Run the sim until `pred(state)` or `maxTicks` is reached. */
function runUntil(w, pred, maxTicks = 3000) {
  for (let i = 0; i < maxTicks && !pred(w.state); i++) tick(w, TICK_DT);
}

describe('economy: resource bag + cost helpers', () => {
  it('a fresh player bag holds every treasury resource', () => {
    const w = fresh();
    expect(w.state.players.red.gold).toBe(CONFIG.startResources.gold);
    expect(w.state.players.red.wood).toBe(CONFIG.startResources.wood);
  });

  it('canAfford / spend / refund operate over generic cost maps', () => {
    const p = {};
    seedTreasury(p, CONFIG);
    expect(canAfford(p, { gold: 100, wood: 50 })).toBe(true);
    expect(canAfford(p, { gold: 1e9 })).toBe(false);
    expect(canAfford(p, null)).toBe(true);
    const before = p.gold;
    spend(p, { gold: 100 });
    expect(p.gold).toBe(before - 100);
    refund(p, { gold: 100 });
    expect(p.gold).toBe(before);
  });
});

describe('research: command lifecycle and stat effects', () => {
  it('a queued research completes and applies its stat modifier', () => {
    const w = fresh();
    const bs = w.entities.makeBuilding('blacksmith', 'red', 8, 12);
    w.state.players.red.gold = 1000;

    const baseDmg = unitStat({ config: CONFIG, state: w.state }, { owner: 'red', kind: 'swordsman' }, 'dmg');
    w.commands.submit({ type: 'research', playerId: 'red', buildingId: bs.id, researchId: 'ironWeapons' });
    runUntil(w, s => s.players.red.research.done.includes('ironWeapons'));

    expect(w.state.players.red.research.done).toContain('ironWeapons');
    const add = CONFIG.research.ironWeapons.effects[0].add;
    expect(unitStat({ config: CONFIG, state: w.state }, { owner: 'red', kind: 'swordsman' }, 'dmg'))
      .toBe(baseDmg + add);
    // The modifier is per-player: the opponent is unaffected.
    expect(unitStat({ config: CONFIG, state: w.state }, { owner: 'blue', kind: 'swordsman' }, 'dmg'))
      .toBe(baseDmg);
  });

  it('rejects an unaffordable or duplicate research', () => {
    const w = fresh();
    const bs = w.entities.makeBuilding('blacksmith', 'red', 8, 12);
    w.state.players.red.gold = 0;
    w.commands.submit({ type: 'research', playerId: 'red', buildingId: bs.id, researchId: 'ironWeapons' });
    tick(w, TICK_DT);
    expect(w.state.players.red.research.pending).not.toContain('ironWeapons');

    w.state.players.red.gold = 1000;
    w.commands.submit({ type: 'research', playerId: 'red', buildingId: bs.id, researchId: 'ironWeapons' });
    tick(w, TICK_DT);
    expect(w.state.players.red.research.pending).toContain('ironWeapons');
    const goldAfterFirst = w.state.players.red.gold;
    // A second submit while it is pending must not spend again.
    w.commands.submit({ type: 'research', playerId: 'red', buildingId: bs.id, researchId: 'ironWeapons' });
    tick(w, TICK_DT);
    expect(w.state.players.red.gold).toBe(goldAfterFirst);
  });
});

describe('research: unlock gating', () => {
  it('isUnlocked: default-open, gated only by an unmet requiresResearch', () => {
    const w = fresh();
    expect(isUnlocked(w.state, 'red', { cost: { gold: 1 } })).toBe(true); // no gate
    const gated = { requiresResearch: 'ironWeapons' };
    expect(isUnlocked(w.state, 'red', gated)).toBe(false);
    w.state.players.red.research.done.push('ironWeapons');
    expect(isUnlocked(w.state, 'red', gated)).toBe(true);
    expect(isUnlocked(w.state, 'blue', gated)).toBe(false); // still gated for the other side
  });

  it('validateTrain reports "not researched" until the prerequisite is done', () => {
    const w = fresh();
    // Synthetic locked unit, made trainable at the town hall — keeps the test
    // independent of shipped content.
    const cfg = {
      ...CONFIG,
      unit: { ...CONFIG.unit, knight: { ...CONFIG.unit.swordsman, requiresResearch: 'ironWeapons' } },
      building: {
        ...CONFIG.building,
        townHall: { ...CONFIG.building.townHall, trains: ['peasant', 'knight'] },
      },
    };
    const deps = { config: cfg, state: w.state, entities: w.entities };
    const th = w.entities.buildingsOf('red').find(b => b.kind === 'townHall');
    w.state.players.red.gold = 1000;

    expect(validateTrain(deps, { playerId: 'red', buildingId: th.id, unitKind: 'knight' }).reason)
      .toBe('not researched');
    w.state.players.red.research.done.push('ironWeapons');
    expect(validateTrain(deps, { playerId: 'red', buildingId: th.id, unitKind: 'knight' }).ok)
      .toBe(true);
  });
});
