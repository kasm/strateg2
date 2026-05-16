import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createGameState } from '../src/core/game-state.js';
import { createMap } from '../src/modules/map/index.js';
import { createPathfinding } from '../src/modules/pathfinding/index.js';
import { createEntities } from '../src/modules/entities/index.js';
import { createCombat } from '../src/modules/combat/index.js';

function wire() {
  const state = createGameState(CONFIG);
  const map = createMap({ config: CONFIG });
  const pathfinding = createPathfinding({ map });
  const entities = createEntities({ state, config: CONFIG, map });
  const combat = createCombat({ state, config: CONFIG, map, entities, pathfinding });
  // Stub the units module so we can test combat without circular instantiation.
  combat.attachUnits({
    moveAdjacentTo: () => true,
    moveAlongPath:  () => false,
    setMoveTarget:  () => true,
  });
  return { state, map, pathfinding, entities, combat };
}

describe('combat module', () => {
  it('melee attack deals damage when in reach and cooldown is ready', () => {
    const { entities, combat } = wire();
    entities.spawnInitial();
    const attacker = entities.makeUnit('swordsman', 'red', 10, 10);
    const victim   = entities.makeUnit('peasant', 'blue', 10, 10); // same tile -> in reach
    attacker.cooldown = 0;
    const hp0 = victim.hp;
    combat.meleeAttack(attacker, victim, 0.016);
    expect(victim.hp).toBe(hp0 - CONFIG.unit.swordsman.dmg);
    expect(attacker.cooldown).toBeGreaterThan(0);
  });

  it('melee attack respects cooldown', () => {
    const { entities, combat } = wire();
    entities.spawnInitial();
    const attacker = entities.makeUnit('swordsman', 'red', 10, 10);
    const victim   = entities.makeUnit('peasant', 'blue', 10, 10);
    attacker.cooldown = 0.5;
    const hp0 = victim.hp;
    combat.meleeAttack(attacker, victim, 0.016);
    expect(victim.hp).toBe(hp0);
  });

  it('archer attack without arrows resets the attacker to idle', () => {
    const { entities, combat } = wire();
    entities.spawnInitial();
    const archer = entities.makeUnit('archer', 'red', 5, 5);
    const victim = entities.makeUnit('peasant', 'blue', 6, 5);
    archer.arrows = 0;
    archer.job = 'attack';
    combat.archerAttack(archer, victim, 0.016);
    expect(archer.job).toBeNull();
    expect(archer.state).toBe('idle');
  });

  it('archer attack spawns a projectile when in range', () => {
    const { state, entities, combat } = wire();
    entities.spawnInitial();
    const archer = entities.makeUnit('archer', 'red', 5, 5);
    const victim = entities.makeUnit('peasant', 'blue', 6, 5); // 1 tile away, within range 6
    archer.arrows = 3;
    archer.cooldown = 0;
    combat.archerAttack(archer, victim, 0.016);
    expect(state.projectiles.length).toBe(1);
    expect(archer.arrows).toBe(2);
  });

  it('updateProjectiles applies hit damage and removes the projectile', () => {
    const { state, entities, combat } = wire();
    entities.spawnInitial();
    const victim = entities.makeUnit('peasant', 'blue', 5, 5);
    // Hand-place a projectile right on top of the target.
    state.projectiles.push({
      x: victim.x, y: victim.y, vx: 0, vy: 0,
      target: victim, dmg: 10, owner: 'red', life: 1.0,
    });
    const hp0 = victim.hp;
    combat.updateProjectiles(0.016);
    expect(victim.hp).toBe(hp0 - 10);
    expect(state.projectiles.length).toBe(0);
  });

  it('updateProjectiles expires arrows whose life runs out', () => {
    const { state, entities, combat } = wire();
    entities.spawnInitial();
    const victim = entities.makeUnit('peasant', 'blue', 5, 5);
    state.projectiles.push({
      x: 0, y: 0, vx: 0, vy: 0,
      target: victim, dmg: 10, owner: 'red', life: 0.001,
    });
    combat.updateProjectiles(0.016);
    expect(state.projectiles.length).toBe(0);
    expect(victim.hp).toBe(victim.maxHp);
  });

  it('updateBuildings produces an arrow when arrowBuilding has wood', () => {
    const { entities, combat } = wire();
    entities.spawnInitial();
    const ab = entities.makeBuilding('arrowBuilding', 'red', 10, 10);
    ab.wood = 5;
    ab.arrows = 0;
    combat.updateBuildings(CONFIG.building.arrowBuilding.arrowTime + 0.01);
    expect(ab.arrows).toBe(1);
    expect(ab.wood).toBe(5 - CONFIG.building.arrowBuilding.woodPerArrow);
  });

  it('updateBuildings advances the train queue and spawns a unit', () => {
    const { state, entities, combat } = wire();
    entities.spawnInitial();
    const barracks = entities.makeBuilding('barracks', 'red', 10, 10);
    barracks.trainQueue.push('swordsman');
    const before = entities.unitsOf('red').length;
    combat.updateBuildings(CONFIG.unit.swordsman.train + 0.01);
    expect(entities.unitsOf('red').length).toBe(before + 1);
    expect(barracks.trainQueue.length).toBe(0);
  });
});
