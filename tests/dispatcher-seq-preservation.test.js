// Invariant: when the network stamps a command's seq/tick on the server, the local
// dispatcher must preserve those exactly — it must not overwrite them with its
// own per-player counter. Without this, lockstep MP would desync on the first command.
//
// The seam is in src/commands/index.js: `if (cmd.seq == null) cmd.seq = nextSeq(...)`.

import { describe, it, expect } from 'vitest';
import { createCommands } from '../src/commands/index.js';

function makeFakeDeps() {
  // The dispatcher only reads state.tick on submit; no real wiring needed for these checks.
  return {
    state:        { tick: 7, entities: [], entitiesById: new Map(), players: { red: { gold: 0, wood: 0 }, blue: { gold: 0, wood: 0 } } },
    config:       {},
    map:          {},
    entities:     { byId: () => null },
    units:        {},
    pathfinding:  {},
  };
}

describe('dispatcher: server-stamped seq/tick are preserved', () => {
  it('does not overwrite seq if already set', () => {
    const cmds = createCommands(makeFakeDeps());
    const stamped = { type: 'order', playerId: 'red', unitIds: [], target: { kind: 'tile', x: 0, y: 0 }, seq: 42, tick: 100 };
    cmds.submit(stamped);
    expect(stamped.seq).toBe(42);
    expect(stamped.tick).toBe(100);
  });

  it('still auto-stamps when seq is missing (single-player path)', () => {
    const cmds = createCommands(makeFakeDeps());
    const cmd = { type: 'order', playerId: 'red', unitIds: [], target: { kind: 'tile', x: 0, y: 0 } };
    cmds.submit(cmd);
    expect(cmd.seq).toBe(1);
    expect(cmd.tick).toBe(7);
  });

  it('per-player seq counter is independent across players in SP path', () => {
    const cmds = createCommands(makeFakeDeps());
    const r1 = { type: 'order', playerId: 'red',  unitIds: [], target: { kind: 'tile', x: 0, y: 0 } };
    const b1 = { type: 'order', playerId: 'blue', unitIds: [], target: { kind: 'tile', x: 0, y: 0 } };
    const r2 = { type: 'order', playerId: 'red',  unitIds: [], target: { kind: 'tile', x: 0, y: 0 } };
    cmds.submit(r1); cmds.submit(b1); cmds.submit(r2);
    expect(r1.seq).toBe(1);
    expect(b1.seq).toBe(1);
    expect(r2.seq).toBe(2);
  });
});
