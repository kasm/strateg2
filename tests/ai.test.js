import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';

// A decide pass plus a command drain — the AI submits commands, drain() applies them,
// mirroring one slice of the real tick (see core/game-loop.js).
function step(w, dt = 2.0) {
  w.ai.updateAI(dt);
  w.commands.drain();
}

function wire() {
  const w = createWorld(CONFIG);
  w.entities.spawnInitial();
  return w;
}

describe('Att AI', () => {
  it('idle blue peasants get assigned to gather jobs (balanced)', () => {
    const { state, entities, ai, commands } = wire();
    state.players.blue.gold = 0; // suppress training so we only measure job assignment
    state.players.blue.wood = 0;
    ai.updateAI(2.0);
    commands.drain();
    const peasants = entities.unitsOf('blue').filter(p => p.kind === 'peasant');
    const goldJobs = peasants.filter(p => p.job === 'gatherGold').length;
    const woodJobs = peasants.filter(p => p.job === 'gatherWood').length;
    expect(goldJobs + woodJobs).toBe(peasants.length);
    expect(Math.abs(goldJobs - woodJobs)).toBeLessThanOrEqual(1);
  });

  it('blue queues a peasant when below minPeasants and can afford it', () => {
    const w = wire();
    w.state.players.blue.gold = 10000;
    step(w);
    const th = w.entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    expect(th.trainQueue).toContain('peasant');
  });

  it('blue builds an arrowBuilding first when affordable', () => {
    const w = wire();
    w.state.players.blue.gold = 1000;
    w.state.players.blue.wood = 1000;
    step(w);
    const built = w.entities.buildingsOf('blue').some(b => b.kind === 'arrowBuilding');
    expect(built).toBe(true);
  });

  it('updateAI is throttled by decideEvery', () => {
    const w = wire();
    w.state.players.blue.gold = 10000;
    step(w); // first pass decides
    const th = w.entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    const queueLen = th.trainQueue.length;
    step(w, 0.01); // too soon — should not decide again
    expect(th.trainQueue.length).toBe(queueLen);
  });

  it('does nothing while gameOver is set', () => {
    const w = wire();
    w.state.gameOver = 'red';
    w.state.players.blue.gold = 10000;
    step(w);
    const th = w.entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    expect(th.trainQueue.length).toBe(0);
  });
});

describe('AI dispatch by state.aiType', () => {
  it('does not act on red while aiType.red is "off"', () => {
    const w = wire();
    w.state.players.red.gold = 10000;
    step(w);
    const peasants = w.entities.unitsOf('red').filter(p => p.kind === 'peasant');
    expect(peasants.every(p => !p.job)).toBe(true);
    const th = w.entities.buildingsOf('red').find(b => b.kind === 'townHall');
    expect(th.trainQueue.length).toBe(0);
  });

  it('drives red with the Att AI when aiType.red is "att"', () => {
    const w = wire();
    w.state.aiType.red = 'att';
    w.state.players.red.gold = 10000;
    w.state.players.red.wood = 1000;
    step(w);
    const peasants = w.entities.unitsOf('red').filter(p => p.kind === 'peasant');
    const assigned = peasants.filter(p => p.job === 'gatherGold' || p.job === 'gatherWood').length;
    expect(assigned).toBe(peasants.length);
    const built = w.entities.buildingsOf('red').some(b => b.kind === 'arrowBuilding');
    expect(built).toBe(true);
  });
});

describe('Def AI', () => {
  it('builds an arrowBuilding, an archeryRange and towerTarget towers', () => {
    const w = wire();
    w.state.aiType.red = 'def';
    w.state.players.red.gold = 100000;
    w.state.players.red.wood = 100000;
    for (let i = 0; i < 12; i++) step(w);
    const buildings = w.entities.buildingsOf('red');
    expect(buildings.some(b => b.kind === 'arrowBuilding')).toBe(true);
    expect(buildings.some(b => b.kind === 'archeryRange')).toBe(true);
    expect(buildings.filter(b => b.kind === 'tower').length).toBe(CONFIG.ai.def.towerTarget);
    // Defensive build — no Barracks, no swordsmen.
    expect(buildings.some(b => b.kind === 'barracks')).toBe(false);
  });

  it('caps gatherers once an arrowBuilding exists, leaving haulers idle', () => {
    const w = wire();
    w.entities.makeBuilding('arrowBuilding', 'red', 5, 12);
    // Top peasants up to minPeasants so the gatherer cap can actually bite.
    while (w.entities.unitsOf('red').filter(u => u.kind === 'peasant').length < CONFIG.ai.def.minPeasants) {
      w.entities.makeUnit('peasant', 'red', 5, 13);
    }
    w.state.aiType.red = 'def';
    w.state.players.red.gold = 100000;
    w.state.players.red.wood = 100000;
    step(w);
    const peasants = w.entities.unitsOf('red').filter(p => p.kind === 'peasant');
    const gatherers = peasants.filter(p => p.job === 'gatherGold' || p.job === 'gatherWood').length;
    expect(gatherers).toBeLessThanOrEqual(CONFIG.ai.def.maxGatherers);
    expect(peasants.length - gatherers).toBeGreaterThanOrEqual(1); // spare haulers stay idle
  });

  it('garrisons an idle archer into a tower', () => {
    const w = wire();
    const tower  = w.entities.makeBuilding('tower', 'red', 6, 9);
    const archer = w.entities.makeUnit('archer', 'red', 9, 9);
    w.state.aiType.red = 'def';
    step(w);
    expect(archer.job).toBe('enterTower');
    expect(archer.jobTargetId).toBe(tower.id);
  });

  it('counter-attacks an enemy that enters its territory', () => {
    const w = wire();
    const archer  = w.entities.makeUnit('archer', 'red', 6, 9);
    const intruder = w.entities.makeUnit('swordsman', 'blue', 8, 9);
    w.state.aiType.red = 'def';
    step(w);
    expect(archer.job).toBe('attack');
    expect(archer.jobTargetId).toBe(intruder.id);
  });

  it('ignores enemies outside its territory', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 6, 9);
    // Far past threatRadius — a blue unit deep on the enemy side.
    w.entities.makeUnit('swordsman', 'blue', CONFIG.mapW - 8, 9);
    w.state.aiType.red = 'def';
    step(w);
    expect(archer.job).not.toBe('attack');
  });
});
