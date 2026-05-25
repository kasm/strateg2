// P6 — Public-Surface Contract.
//
// Snapshots the public surface (exported names + runtime API shape) of every
// module's index.js. The snapshot file IS the contract: any change to a module's
// surface — adding, removing, or renaming an export — shows up here as a diff
// that must be reviewed and accepted.
//
// Two layers of snapshots:
//   1. Runtime API: what `create<Module>(deps)` returns. This is what callers
//      actually use day-to-day. Reads from a freshly-built world.
//   2. Named exports: what `import * from '.../index.js'` yields. Catches
//      non-factory exports (typedefs, helpers, constants).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createWorld } from '../src/core/world.js';

describe('P6 — runtime API surface of each module', () => {
  const w = createWorld(CONFIG);
  // Skip 'state' and 'config' — they're plain data, not modules.
  const moduleNames = ['ai', 'combat', 'commands', 'entities', 'map', 'pathfinding', 'units', 'recorder'];

  for (const name of moduleNames) {
    it(`${name} — keys of create${name[0].toUpperCase() + name.slice(1)}() output`, () => {
      expect(Object.keys(w[name]).sort()).toMatchSnapshot();
    });
  }
});

describe('P6 — named exports of each public module file', () => {
  // Module files whose export list is part of the public contract.
  // Internal (*.internal.js) files are excluded — they have no contract.
  const modulePaths = [
    '../src/sim/index.js',
    '../src/commands/index.js',
    '../src/modules/combat/index.js',
    '../src/modules/units/index.js',
    '../src/modules/ai/index.js',
    '../src/modules/entities/index.js',
    '../src/modules/map/index.js',
    '../src/modules/pathfinding/index.js',
    '../src/replay/recorder.js',
    '../src/replay/playback.js',
    '../src/core/world.js',
    '../src/core/game-loop.js',
    '../src/core/game-state.js',
    '../src/core/economy.js',
    '../src/core/research.js',
    '../src/core/stats.js',
    '../src/core/config.js',
  ];

  for (const p of modulePaths) {
    it(p.replace('../', ''), async () => {
      const mod = await import(p);
      expect(Object.keys(mod).sort()).toMatchSnapshot();
    });
  }
});
