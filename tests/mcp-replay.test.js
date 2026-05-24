// Contract test for the replay MCP server.
//
// Two parity guarantees:
//   1. `replay.analyze` markdown == `.claude/scripts/replay.mjs` stdout
//      byte-for-byte (the shared helper is the same; the CLI is now a thin
//      wrapper, so this test guards against that wrapper drifting).
//   2. `replay.diff` reports {identical: true} for the same replay against
//      itself, and reports divergence when given two materially different
//      replays.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFIG } from '../src/core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../src/sim/index.js';
import { HANDLERS } from '../.claude/mcp/replay/handlers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP_DIR = resolve(ROOT, 'tests/.tmp-mcp-replay');

function playAndDump(name, { aiRed, aiBlue, ticks }) {
  const world = createSimWorld(CONFIG);
  spawnInitial(world);
  world.state.aiType.red  = aiRed;
  world.state.aiType.blue = aiBlue;
  for (let i = 0; i < ticks; i++) {
    stepTick(world, TICK_DT);
    if (world.state.gameOver) break;
  }
  const replay = world.recorder.toReplay(world.state);
  const path = resolve(TMP_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(replay));
  return path;
}

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('mcp/replay — CLI parity for analyze', () => {
  it('replay.analyze output equals .claude/scripts/replay.mjs stdout', async () => {
    const path = playAndDump('analyze-parity', { aiRed: 'att', aiBlue: 'def', ticks: 200 });
    const relPath = 'tests/.tmp-mcp-replay/analyze-parity.json';

    const viaMcp = (await HANDLERS['replay.analyze']({ path: relPath })).markdown;
    const cli = spawnSync(process.execPath, [resolve(ROOT, '.claude/scripts/replay.mjs'), relPath], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    if (cli.status !== 0) throw new Error(`CLI failed: ${cli.stderr}`);
    // CLI uses console.log which appends a trailing newline.
    const cliOut = cli.stdout.replace(/\n$/, '');

    expect(viaMcp).toBe(cliOut);
    // Sanity: report mentions the label (relative path) we passed in.
    expect(viaMcp).toContain(relPath);
    void path; // path used via relPath
  });
});

describe('mcp/replay — verify', () => {
  it('verifies a freshly recorded replay', async () => {
    const path = playAndDump('verify-fresh', { aiRed: 'att', aiBlue: 'def', ticks: 150 });
    const rel = 'tests/.tmp-mcp-replay/verify-fresh.json';
    const r = await HANDLERS['replay.verify']({ path: rel });
    expect(r.verified).toBe(true);
    expect(r.finalTick).toBeGreaterThan(0);
    expect(r.checksum).toMatch(/^\d+:\d+$/);
    void path;
  });
});

describe('mcp/replay — diff', () => {
  it('reports identical for the same replay against itself', async () => {
    playAndDump('diff-same', { aiRed: 'att', aiBlue: 'def', ticks: 100 });
    const rel = 'tests/.tmp-mcp-replay/diff-same.json';
    const d = await HANDLERS['replay.diff']({ a: rel, b: rel });
    expect(d.identical).toBe(true);
    expect(d.firstChecksumDivergenceTick).toBe(null);
    expect(d.firstCommandDivergenceTick).toBe(null);
    expect(d.commandsByTickDiff).toEqual([]);
  });

  it('reports divergence for two materially different matches', async () => {
    playAndDump('diff-a', { aiRed: 'att', aiBlue: 'def', ticks: 200 });
    playAndDump('diff-b', { aiRed: 'def', aiBlue: 'att', ticks: 200 });
    const d = await HANDLERS['replay.diff']({
      a: 'tests/.tmp-mcp-replay/diff-a.json',
      b: 'tests/.tmp-mcp-replay/diff-b.json',
    });
    expect(d.identical).toBe(false);
    // Different AI on each side from tick 0 -> commands and state both diverge.
    expect(d.firstCommandDivergenceTick).not.toBe(null);
    expect(d.firstChecksumDivergenceTick).not.toBe(null);
  });
});

describe('mcp/replay — input validation', () => {
  it('rejects non-.json path', async () => {
    await expect(HANDLERS['replay.verify']({ path: 'README.md' })).rejects.toThrow(/\.json/);
  });

  it('rejects absolute path', async () => {
    await expect(HANDLERS['replay.verify']({ path: '/etc/passwd.json' })).rejects.toThrow(/under the repo/);
  });

  it('rejects path with ".."', async () => {
    await expect(HANDLERS['replay.verify']({ path: '../outside.json' })).rejects.toThrow(/under the repo/);
  });
});
