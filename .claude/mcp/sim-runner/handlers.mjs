// Pure tool handlers for the sim-runner MCP server.
//
// Split from server.mjs (which wires these into the MCP SDK over stdio) so the
// contract test can import and call handlers directly without spinning up a
// transport.
//
// HARD INVARIANT — P7 single-writer:
//   The ONLY tool that mutates sim state is `sim.submit`, which forwards to
//   `submitCommand` from src/sim/index.js (the public mutation entry point that
//   funnels into `commands.submit()` -> `drain()`). No other handler in this
//   file may write to `world.state.*`.
//
//   tests/mcp-sim-runner.test.js asserts this by grep — adding any other
//   mutation surface to this file or to server.mjs will fail CI.

import {
  createSimWorld,
  spawnInitial,
  submitCommand,
  stepTick,
  TICK_DT,
} from '../../../src/sim/index.js';
import { CONFIG } from '../../../src/core/config.js';
import { stateChecksum } from '../../../src/replay/checksum.js';

/** @returns {{ worlds: Map<string, import('../../../src/core/world.js').SimWorld>, nextId: { n: number } }} */
export function createContext() {
  return { worlds: new Map(), nextId: { n: 0 } };
}

// Deterministic id allocation — no crypto, no Date.now (P8).
function allocId(ctx) {
  ctx.nextId.n += 1;
  return `w${ctx.nextId.n}`;
}

function mustGet(ctx, worldId) {
  const w = ctx.worlds.get(worldId);
  if (!w) throw new Error(`unknown worldId: ${worldId}`);
  return w;
}

/** Filtered, read-only view of a world. Never returns mutable refs. */
function viewSnapshot(world, fields) {
  const allowed = fields && fields.length
    ? new Set(fields)
    : new Set(['tick', 'players', 'entitiesCount', 'gameOver']);
  const s = world.state;
  const out = {};
  if (allowed.has('tick')) out.tick = s.tick;
  if (allowed.has('players')) {
    out.players = {
      red:  { gold: s.players.red.gold,  wood: s.players.red.wood },
      blue: { gold: s.players.blue.gold, wood: s.players.blue.wood },
    };
  }
  if (allowed.has('entitiesCount')) out.entitiesCount = s.entities.length;
  if (allowed.has('gameOver')) out.gameOver = s.gameOver || null;
  if (allowed.has('aiType')) out.aiType = { red: s.aiType.red, blue: s.aiType.blue };
  return out;
}

export const HANDLERS = {
  'sim.create': async ({ mapW, mapH } = {}, ctx) => {
    const opts = (mapW != null || mapH != null) ? { mapW, mapH } : undefined;
    const world = createSimWorld(CONFIG, opts);
    const worldId = allocId(ctx);
    ctx.worlds.set(worldId, world);
    return { worldId, tick: world.state.tick };
  },

  'sim.spawnInitial': async ({ worldId }, ctx) => {
    const world = mustGet(ctx, worldId);
    spawnInitial(world);
    return { worldId, tick: world.state.tick };
  },

  'sim.submit': async ({ worldId, cmd }, ctx) => {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') {
      throw new Error('cmd must be an object with a string "type"');
    }
    const world = mustGet(ctx, worldId);
    submitCommand(world, cmd);
    return { ok: true };
  },

  'sim.step': async ({ worldId, ticks = 1 }, ctx) => {
    const world = mustGet(ctx, worldId);
    const n = Math.max(1, Math.min(10_000, ticks | 0));
    for (let i = 0; i < n; i++) {
      stepTick(world, TICK_DT);
      if (world.state.gameOver) break;
    }
    return {
      worldId,
      tick: world.state.tick,
      victor: world.state.gameOver || null,
    };
  },

  'sim.checksum': async ({ worldId }, ctx) => {
    const world = mustGet(ctx, worldId);
    return {
      worldId,
      tick: world.state.tick,
      checksum: stateChecksum(world.state),
    };
  },

  'sim.snapshot': async ({ worldId, fields }, ctx) => {
    const world = mustGet(ctx, worldId);
    return { worldId, view: viewSnapshot(world, fields) };
  },

  'sim.dispose': async ({ worldId }, ctx) => {
    const existed = ctx.worlds.delete(worldId);
    return { ok: existed };
  },
};

export const TOOL_SPECS = [
  {
    name: 'sim.create',
    description: 'Create a fresh headless simulation world. Returns a worldId for use in subsequent tools.',
    inputSchema: {
      type: 'object',
      properties: {
        mapW: { type: 'number', description: 'Map width in tiles (optional)' },
        mapH: { type: 'number', description: 'Map height in tiles (optional)' },
      },
    },
  },
  {
    name: 'sim.spawnInitial',
    description: 'Seed the standard match (gold mines, town halls, peasants) into a world created by sim.create.',
    inputSchema: {
      type: 'object',
      properties: { worldId: { type: 'string' } },
      required: ['worldId'],
    },
  },
  {
    name: 'sim.submit',
    description: 'Submit a command to a world. THE ONLY MUTATION TOOL. Forwards to commands.submit() — same path as input/AI/network.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string' },
        cmd: {
          type: 'object',
          description: 'A Command object — see src/commands/index.js Command typedef.',
        },
      },
      required: ['worldId', 'cmd'],
    },
  },
  {
    name: 'sim.step',
    description: 'Advance the world by N ticks (default 1). Stops early if gameOver.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string' },
        ticks: { type: 'number', minimum: 1, maximum: 10000 },
      },
      required: ['worldId'],
    },
  },
  {
    name: 'sim.checksum',
    description: 'Deterministic digest of the world state (uses src/replay/checksum.js). Two worlds with the same checksum are byte-identical.',
    inputSchema: {
      type: 'object',
      properties: { worldId: { type: 'string' } },
      required: ['worldId'],
    },
  },
  {
    name: 'sim.snapshot',
    description: 'Read-only view of selected state fields. No object refs returned.',
    inputSchema: {
      type: 'object',
      properties: {
        worldId: { type: 'string' },
        fields: {
          type: 'array',
          items: { type: 'string', enum: ['tick', 'players', 'entitiesCount', 'gameOver', 'aiType'] },
        },
      },
      required: ['worldId'],
    },
  },
  {
    name: 'sim.dispose',
    description: 'Release a world. Returns {ok: false} if the worldId was unknown.',
    inputSchema: {
      type: 'object',
      properties: { worldId: { type: 'string' } },
      required: ['worldId'],
    },
  },
];
