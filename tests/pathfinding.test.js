import { describe, it, expect } from 'vitest';
import { createPathfinding } from '../src/modules/pathfinding/index.js';
import { aStarSearch, findAdjacentWalkableTile } from '../src/modules/pathfinding/a-star.js';

// Build a tiny mock map. '.' = walkable, '#' = solid.
function mockMap(rows) {
  const grid = rows.map(r => r.split(''));
  const h = grid.length, w = grid[0].length;
  return {
    w, h, grid,
    isWalkable: (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] !== '#',
  };
}

describe('aStarSearch', () => {
  it('returns [] when start === goal', () => {
    const m = mockMap(['...', '...']);
    expect(aStarSearch(1, 1, 1, 1, m.isWalkable)).toEqual([]);
  });

  it('finds a straight path on an open grid', () => {
    const m = mockMap(['.....', '.....', '.....']);
    const path = aStarSearch(0, 0, 4, 0, m.isWalkable);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
  });

  it('routes around a wall', () => {
    const m = mockMap([
      '.....',
      '.###.',
      '.....',
    ]);
    const path = aStarSearch(0, 1, 4, 1, m.isWalkable);
    expect(path).not.toBeNull();
    expect(path.some(p => p.y !== 1)).toBe(true);
  });

  it('returns null when unreachable', () => {
    const m = mockMap([
      '...#...',
      '...#...',
      '...#...',
    ]);
    expect(aStarSearch(0, 1, 6, 1, m.isWalkable)).toBeNull();
  });

  it('reaches a non-walkable goal tile (goal is exempt from walkability)', () => {
    const m = mockMap(['..#']);
    const path = aStarSearch(0, 0, 2, 0, m.isWalkable);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 2, y: 0 });
  });

  it('does not corner-cut diagonally between two solid tiles', () => {
    // Diagonal from (0,0) to (1,1) blocked by walls at (1,0) and (0,1).
    const m = mockMap([
      '.#',
      '#.',
    ]);
    const path = aStarSearch(0, 0, 1, 1, m.isWalkable);
    expect(path).toBeNull();
  });
});

describe('findAdjacentWalkableTile', () => {
  it('returns null when nothing around is walkable', () => {
    const m = mockMap([
      '###',
      '#X#',
      '###',
    ]);
    expect(findAdjacentWalkableTile(1, 1, 1, 1, 1, 1, m.isWalkable)).toBeNull();
  });

  it('returns the closest walkable neighbor', () => {
    const m = mockMap([
      '.....',
      '.....',
      '..X..',
      '.....',
      '.....',
    ]);
    const spot = findAdjacentWalkableTile(2, 2, 1, 1, 0, 0, m.isWalkable);
    expect(spot).toEqual({ x: 1, y: 1 });
  });

  it('handles multi-tile footprints', () => {
    const m = mockMap([
      '......',
      '......',
      '..BB..',
      '..BB..',
      '......',
    ]);
    const spot = findAdjacentWalkableTile(2, 2, 2, 2, 5, 4, m.isWalkable);
    expect(spot).toEqual({ x: 4, y: 4 });
  });
});

describe('createPathfinding (DI facade)', () => {
  it('wires map.isWalkable into aStar', () => {
    const m = mockMap(['....']);
    const pf = createPathfinding({ map: m });
    expect(pf.aStar(0, 0, 3, 0)).not.toBeNull();
  });

  it('wires map.isWalkable into findAdjacentWalkable', () => {
    const m = mockMap(['.X.']);
    const pf = createPathfinding({ map: m });
    expect(pf.findAdjacentWalkable(1, 0, 1, 1, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});
