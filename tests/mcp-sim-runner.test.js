// Contract test for the sim-runner MCP server.
//
// Two layers:
//   1. Behavioral: drive the handlers through a representative scenario and
//      assert the checksum matches a direct sim drive — i.e. the MCP surface
//      is a faithful proxy for the underlying sim, no hidden mutations or
//      reordering.
//   2. Structural: enforce P7 by greppable contract — `submitCommand` is the
//      ONLY mutation entry point in handlers.mjs and server.mjs. Any added
//      mutation surface (a new tool that writes to world.state, etc.) fails
//      this test immediately.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HANDLERS, createContext } from '../.claude/mcp/sim-runner/handlers.mjs';
import { CONFIG } from '../src/core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../src/sim/index.js';
import { stateChecksum } from '../src/replay/checksum.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_DIR = resolve(HERE, '..', '.claude/mcp/sim-runner');

describe('mcp/sim-runner — behavioral parity with direct sim', () => {
  it('produces the same checksum as a direct sim drive', async () => {
    // Drive via MCP handlers.
    const ctx = createContext();
    const { worldId } = await HANDLERS['sim.create']({}, ctx);
    await HANDLERS['sim.spawnInitial']({ worldId }, ctx);
    await HANDLERS['sim.submit'](
      { worldId, cmd: { type: 'setOption', playerId: 'red', key: 'alwaysHit', value: false } },
      ctx,
    );
    await HANDLERS['sim.step']({ worldId, ticks: 100 }, ctx);
    const { checksum: viaMcp } = await HANDLERS['sim.checksum']({ worldId }, ctx);

    // Drive directly with the exact same sequence.
    const world = createSimWorld(CONFIG);
    spawnInitial(world);
    submitCommand(world, { type: 'setOption', playerId: 'red', key: 'alwaysHit', value: false });
    for (let i = 0; i < 100; i++) {
      stepTick(world, TICK_DT);
      if (world.state.gameOver) break;
    }
    const direct = stateChecksum(world.state);

    expect(viaMcp).toBe(direct);
  });

  it('rejects unknown worldId', async () => {
    const ctx = createContext();
    await expect(HANDLERS['sim.checksum']({ worldId: 'nope' }, ctx)).rejects.toThrow(/unknown worldId/);
  });

  it('snapshot returns no mutable refs', async () => {
    const ctx = createContext();
    const { worldId } = await HANDLERS['sim.create']({}, ctx);
    await HANDLERS['sim.spawnInitial']({ worldId }, ctx);
    const snap = await HANDLERS['sim.snapshot']({ worldId, fields: ['players', 'entitiesCount'] }, ctx);
    // Mutating the snapshot must not affect the world's underlying state.
    snap.view.players.red.gold = -1;
    const fresh = await HANDLERS['sim.snapshot']({ worldId, fields: ['players'] }, ctx);
    expect(fresh.view.players.red.gold).not.toBe(-1);
  });
});

describe('mcp/sim-runner — P7 structural contract', () => {
  it('handlers.mjs and server.mjs contain exactly one mutation-path import: submitCommand', () => {
    const files = ['handlers.mjs', 'server.mjs'].map((f) => readFileSync(resolve(MCP_DIR, f), 'utf8'));
    const combined = files.join('\n');

    // submitCommand should be imported and used. Any reference to a different
    // mutating helper (commands.drain bypass, direct state writes, etc.) is
    // forbidden in this surface.
    const submitCommandRefs = (combined.match(/\bsubmitCommand\b/g) || []).length;
    expect(submitCommandRefs).toBeGreaterThan(0);

    // Forbidden patterns: anything that bypasses the dispatcher.
    expect(combined).not.toMatch(/\.state\s*\.\s*\w+\s*=/);              // world.state.X = ...
    expect(combined).not.toMatch(/state\s*\.\s*entities\s*\.\s*(push|pop|splice|shift|unshift)\s*\(/);
    expect(combined).not.toMatch(/state\s*\.\s*projectiles\s*\.\s*(push|pop|splice|shift|unshift)\s*\(/);
    expect(combined).not.toMatch(/world\s*\.\s*commands\s*\.\s*drain\s*\(/); // dispatcher draining is the sim's job
  });

  it('handlers.mjs and server.mjs use no Math.random / Date.now / performance.now (P8)', () => {
    const files = ['handlers.mjs', 'server.mjs'].map((f) => readFileSync(resolve(MCP_DIR, f), 'utf8'));
    // Strip line comments so the contract only inspects real code — the
    // file may legitimately mention these symbols in a "we don't use these"
    // explanatory comment.
    const code = files.join('\n').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).not.toMatch(/Math\.random\(/);
    expect(code).not.toMatch(/Date\.now\(/);
    expect(code).not.toMatch(/performance\.now\(/);
    expect(code).not.toMatch(/new Date\(/);
  });
});
