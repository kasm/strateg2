import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createGameState } from '../src/core/game-state.js';
import { createMap } from '../src/modules/map/index.js';
import { createEntities } from '../src/modules/entities/index.js';

function wire() {
  const state = createGameState(CONFIG);
  const map   = createMap({ config: CONFIG });
  const entities = createEntities({ state, config: CONFIG, map });
  return { state, map, entities };
}

describe('entities module', () => {
  it('spawnInitial seeds the standard layout', () => {
    const { state, entities } = wire();
    entities.spawnInitial();
    expect(entities.buildingsOf('red').length).toBeGreaterThan(0);
    expect(entities.buildingsOf('blue').length).toBeGreaterThan(0);
    expect(entities.unitsOf('red').length).toBe(3);
    expect(entities.unitsOf('blue').length).toBe(3);
    // 2 gold mines + 2 town halls + 6 peasants
    expect(state.entities.length).toBe(10);
  });

  it('makeBuilding marks tiles as occupied', () => {
    const { map, entities } = wire();
    entities.spawnInitial();
    const b = entities.makeBuilding('barracks', 'red', 10, 10);
    expect(map.tileAt(10, 10).building).toBe(b);
    expect(map.tileAt(11, 10).building).toBe(b);
    expect(map.isWalkable(10, 10)).toBe(false);
  });

  it('killEntity clears the footprint and selection', () => {
    const { state, map, entities } = wire();
    entities.spawnInitial();
    const b = entities.makeBuilding('barracks', 'red', 10, 10);
    state.selected.push(b);
    entities.killEntity(b);
    expect(b.hp).toBe(0);
    expect(map.tileAt(10, 10).building).toBeNull();
    expect(state.selected).not.toContain(b);
  });

  it('pruneDead removes hp<=0 entities', () => {
    const { entities } = wire();
    entities.spawnInitial();
    const before = entities.unitsOf('red').length;
    const peasant = entities.unitsOf('red')[0];
    entities.killEntity(peasant);
    entities.pruneDead();
    expect(entities.unitsOf('red').length).toBe(before - 1);
  });

  it('nearestOf filters and picks the closest match', () => {
    const { entities } = wire();
    entities.spawnInitial();
    const peasants = entities.unitsOf('red');
    const target = entities.nearestOf(
      e => e.type === 'unit' && e.owner === 'red' && e.kind === 'peasant',
      peasants[0].x, peasants[0].y,
    );
    expect(target).toBe(peasants[0]);
  });

  it('findEntityAt returns the building at a pixel inside its footprint', () => {
    const { entities } = wire();
    entities.spawnInitial();
    const th = entities.buildingsOf('red').find(b => b.kind === 'townHall');
    const cx = (th.tileX + th.w / 2) * CONFIG.tile;
    const cy = (th.tileY + th.h / 2) * CONFIG.tile;
    expect(entities.findEntityAt(cx, cy)).toBe(th);
  });
});
