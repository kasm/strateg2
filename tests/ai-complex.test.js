import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';

// One decide pass plus a command drain — mirrors a slice of the real tick.
function step(w, dt = 2.0) {
  w.ai.updateAI(dt);
  w.commands.drain();
}

function wire() {
  const w = createWorld(CONFIG);
  w.entities.spawnInitial();
  return w;
}

const COMPLEX_AIS = ['adaptive', 'utility', 'hybrid'];

// --- shared macro behaviour, run for each of the three complex AIs ---------
for (const aiType of COMPLEX_AIS) {
  describe(`${aiType} AI — macro`, () => {
    it('assigns idle peasants to gather jobs', () => {
      const w = wire();
      w.state.aiType.red = aiType;
      w.state.players.red.gold = 0; // suppress training so we only measure assignment
      w.state.players.red.wood = 0;
      step(w);
      const peasants = w.entities.unitsOf('red').filter(p => p.kind === 'peasant');
      const assigned = peasants.filter(p => p.job === 'gather');
      expect(assigned.length).toBe(peasants.length);
    });

    it('builds an arrowBuilding and a combat building when flush', () => {
      const w = wire();
      w.state.aiType.red = aiType;
      w.state.players.red.gold = 100000;
      w.state.players.red.wood = 100000;
      for (let i = 0; i < 12; i++) step(w);
      const buildings = w.entities.buildingsOf('red');
      expect(buildings.some(b => b.kind === 'arrowBuilding')).toBe(true);
      expect(buildings.some(b => b.kind === 'archeryRange' || b.kind === 'barracks')).toBe(true);
    });

    it('counter-picks swordsmen against an archer-heavy enemy', () => {
      const w = wire();
      // Pre-place the production chain so the AI can train combat units immediately.
      w.entities.makeBuilding('arrowBuilding', 'red', 10, 2);
      w.entities.makeBuilding('archeryRange', 'red', 13, 2);
      w.entities.makeBuilding('barracks', 'red', 16, 2);
      while (w.entities.unitsOf('red').filter(u => u.kind === 'peasant').length < CONFIG.ai.shared.minPeasants) {
        w.entities.makeUnit('peasant', 'red', 7, 12);
      }
      for (let i = 0; i < 6; i++) w.entities.makeUnit('archer', 'blue', 30 + (i % 4), 2 + Math.floor(i / 4));
      w.state.aiType.red = aiType;
      w.state.players.red.gold = 80; // exactly one swordsman (80) or archer (70)
      w.state.players.red.wood = 0;
      step(w);
      const barracks = w.entities.buildingsOf('red').find(b => b.kind === 'barracks');
      const range    = w.entities.buildingsOf('red').find(b => b.kind === 'archeryRange');
      expect(barracks.trainQueue).toContain('swordsman');
      expect(range.trainQueue).not.toContain('archer');
    });

    it('counter-picks archers against a melee-heavy enemy', () => {
      const w = wire();
      w.entities.makeBuilding('arrowBuilding', 'red', 10, 2);
      w.entities.makeBuilding('archeryRange', 'red', 13, 2);
      w.entities.makeBuilding('barracks', 'red', 16, 2);
      while (w.entities.unitsOf('red').filter(u => u.kind === 'peasant').length < CONFIG.ai.shared.minPeasants) {
        w.entities.makeUnit('peasant', 'red', 7, 12);
      }
      for (let i = 0; i < 6; i++) w.entities.makeUnit('swordsman', 'blue', 30 + (i % 4), 2 + Math.floor(i / 4));
      w.state.aiType.red = aiType;
      w.state.players.red.gold = 80;
      w.state.players.red.wood = 0;
      step(w);
      const barracks = w.entities.buildingsOf('red').find(b => b.kind === 'barracks');
      const range    = w.entities.buildingsOf('red').find(b => b.kind === 'archeryRange');
      expect(range.trainQueue).toContain('archer');
      expect(barracks.trainQueue).not.toContain('swordsman');
    });

    it('does nothing while gameOver is set', () => {
      const w = wire();
      w.state.aiType.red = aiType;
      w.state.gameOver = 'blue';
      w.state.players.red.gold = 100000;
      w.state.players.red.wood = 100000;
      step(w);
      const th = w.entities.buildingsOf('red').find(b => b.kind === 'townHall');
      expect(th.trainQueue.length).toBe(0);
      expect(w.entities.buildingsOf('red').length).toBe(1); // only the Town Hall
    });
  });
}

// --- rule-based micro (adaptive) -------------------------------------------
describe('adaptive AI — rule-based micro', () => {
  it('retreats a low-HP unit that has an enemy in range', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    archer.hp = 5; // well below retreatHpFrac of maxHp
    w.entities.makeUnit('swordsman', 'blue', 22, 9);
    w.state.aiType.red = 'adaptive';
    step(w);
    expect(archer.job).not.toBe('attack');
    expect(Array.isArray(archer.path) && archer.path.length > 0).toBe(true);
  });

  it('kites an archer away from an adjacent swordsman', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    w.entities.makeUnit('swordsman', 'blue', 21, 9); // inside kite radius
    w.state.aiType.red = 'adaptive';
    step(w);
    expect(archer.job).not.toBe('attack');
    expect(Array.isArray(archer.path) && archer.path.length > 0).toBe(true);
  });

  it('focus-fires the weakest enemy in range', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    const weak   = w.entities.makeUnit('archer', 'blue', 22, 9);
    const strong = w.entities.makeUnit('archer', 'blue', 23, 9);
    weak.hp = 5; strong.hp = 35;
    w.state.aiType.red = 'adaptive';
    step(w);
    expect(archer.job).toBe('attack');
    expect(archer.jobTargetId).toBe(weak.id);
  });
});

// --- utility-scored micro (hybrid) -----------------------------------------
describe('hybrid AI — utility-scored micro', () => {
  it('retreats a low-HP unit that has an enemy in range', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    archer.hp = 5;
    w.entities.makeUnit('swordsman', 'blue', 22, 9);
    w.state.aiType.red = 'hybrid';
    step(w);
    expect(archer.job).not.toBe('attack');
    expect(Array.isArray(archer.path) && archer.path.length > 0).toBe(true);
  });

  it('focus-fires the weakest enemy in range', () => {
    const w = wire();
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    const weak   = w.entities.makeUnit('archer', 'blue', 22, 9);
    const strong = w.entities.makeUnit('archer', 'blue', 23, 9);
    weak.hp = 5; strong.hp = 35;
    w.state.aiType.red = 'hybrid';
    step(w);
    expect(archer.job).toBe('attack');
    expect(archer.jobTargetId).toBe(weak.id);
  });
});

// --- orchestrator ----------------------------------------------------------
describe('AI orchestrator — micro sub-tick', () => {
  it('runs micro on a sub-tick while the macro pass stays throttled', () => {
    const w = wire();
    w.state.aiType.red = 'adaptive';
    w.state.players.red.gold = 100000;
    w.state.players.red.wood = 100000;
    const archer = w.entities.makeUnit('archer', 'red', 20, 9);
    step(w); // full decide pass: timers reset (decideTimer=1.5, microTimer=microEvery)
    const buildingsAfterMacro = w.entities.buildingsOf('red').length;

    // Inject a threat, then advance by less than decideEvery but at least microEvery.
    w.entities.makeUnit('swordsman', 'blue', 22, 9);
    w.ai.updateAI(0.5);
    w.commands.drain();

    // Macro was throttled — no new building. Micro ran — the archer got an order.
    expect(w.entities.buildingsOf('red').length).toBe(buildingsAfterMacro);
    expect(archer.job === 'attack' || (Array.isArray(archer.path) && archer.path.length > 0)).toBe(true);
  });

  it('resetAI clears AI memory without breaking later decisions', () => {
    const w = wire();
    w.state.aiType.red = 'adaptive';
    w.state.players.red.gold = 100000;
    w.state.players.red.wood = 100000;
    for (let i = 0; i < 4; i++) step(w);
    w.ai.resetAI();
    expect(() => step(w)).not.toThrow();
    const peasants = w.entities.unitsOf('red').filter(p => p.kind === 'peasant');
    expect(peasants.some(p => p.job === 'gather')).toBe(true);
  });
});
