import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createGameState } from '../src/core/game-state.js';
import { createMap } from '../src/modules/map/index.js';
import { createEntities } from '../src/modules/entities/index.js';
import { createAI } from '../src/modules/ai/index.js';

function wire() {
  const state = createGameState(CONFIG);
  const map = createMap({ config: CONFIG });
  const entities = createEntities({ state, config: CONFIG, map });
  const ai = createAI({ state, config: CONFIG, entities, map });
  return { state, map, entities, ai };
}

describe('AI module', () => {
  it('idle blue peasants get assigned to gather jobs (balanced)', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.players.blue.gold = 0; // suppress training so we only measure job assignment
    state.players.blue.wood = 0;
    ai.updateAI(2.0); // > decideEvery
    const peasants = entities.unitsOf('blue').filter(p => p.kind === 'peasant');
    const goldJobs = peasants.filter(p => p.job === 'gatherGold').length;
    const woodJobs = peasants.filter(p => p.job === 'gatherWood').length;
    expect(goldJobs + woodJobs).toBe(peasants.length);
    expect(Math.abs(goldJobs - woodJobs)).toBeLessThanOrEqual(1);
  });

  it('blue queues a peasant when below minPeasants and can afford it', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.players.blue.gold = 10000;
    ai.updateAI(2.0);
    const th = entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    expect(th.trainQueue).toContain('peasant');
  });

  it('blue builds an arrowBuilding first when affordable', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.players.blue.gold = 1000;
    state.players.blue.wood = 1000;
    ai.updateAI(2.0);
    const built = entities.buildingsOf('blue').some(b => b.kind === 'arrowBuilding');
    expect(built).toBe(true);
  });

  it('updateAI is throttled by decideEvery', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.players.blue.gold = 10000;
    ai.updateAI(2.0); // first pass decides
    const th = entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    const queueLen = th.trainQueue.length;
    ai.updateAI(0.01); // too soon — should not decide again
    expect(th.trainQueue.length).toBe(queueLen);
  });

  it('does nothing while gameOver is set', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.gameOver = 'red';
    state.players.blue.gold = 10000;
    ai.updateAI(2.0);
    const th = entities.buildingsOf('blue').find(b => b.kind === 'townHall');
    expect(th.trainQueue.length).toBe(0);
  });

  it('does not act on red while autoFight.red is off', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.players.red.gold = 10000;
    ai.updateAI(2.0);
    const peasants = entities.unitsOf('red').filter(p => p.kind === 'peasant');
    expect(peasants.every(p => !p.job)).toBe(true);
    const th = entities.buildingsOf('red').find(b => b.kind === 'townHall');
    expect(th.trainQueue.length).toBe(0);
  });

  it('drives red when autoFight.red is enabled', () => {
    const { state, entities, ai } = wire();
    entities.spawnInitial();
    state.autoFight.red = true;
    state.players.red.gold = 10000;
    state.players.red.wood = 1000;
    ai.updateAI(2.0);
    const peasants = entities.unitsOf('red').filter(p => p.kind === 'peasant');
    const assigned = peasants.filter(p => p.job === 'gatherGold' || p.job === 'gatherWood').length;
    expect(assigned).toBe(peasants.length);
    const built = entities.buildingsOf('red').some(b => b.kind === 'arrowBuilding');
    expect(built).toBe(true);
  });
});
