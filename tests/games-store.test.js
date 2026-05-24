// Server-side replay persistence: validate input, write atomically, end up with
// a file that round-trips back through reconstructReplay() unchanged.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

import { CONFIG } from '../src/core/config.js';
import { createSimWorld, spawnInitial, stepTick, TICK_DT } from '../src/sim/index.js';
import { reconstructReplay } from '../src/replay/reconstruct.js';
import { createGamesStore, ReplayValidationError } from '../src/server/games-store.js';

// Build a real replay from a short AI-vs-AI match so we're testing against a
// live recorder output, not a hand-crafted fixture.
function makeReplay() {
  const w = createSimWorld(CONFIG);
  spawnInitial(w);
  w.state.aiType.red  = 'att';
  w.state.aiType.blue = 'def';
  for (let i = 0; i < 200; i++) {
    stepTick(w, TICK_DT);
    if (w.state.gameOver) break;
  }
  return w.recorder.toReplay(w.state);
}

let projectRoot;
let store;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'strateg2-games-test-'));
  store = createGamesStore({ projectRoot });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

describe('games-store: happy path', () => {
  it('writes a replay that reconstructs back to the same checksum', async () => {
    const replay = makeReplay();
    const file = await store.saveReplay(replay, 'sp');

    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    expect(reconstructReplay(parsed).verified).toBe(true);
  });

  it('filename encodes mode, winner, and timestamp; lives under .games/', async () => {
    const replay = makeReplay();
    const file = await store.saveReplay(replay, 'mp');

    expect(file).toMatch(/[\\/]\.games[\\/]/);
    const base = file.split(/[\\/]/).pop();
    // <stamp>-<mode>-<winner>-<6hex>.json
    expect(base).toMatch(/^[0-9A-Za-z-]+-mp-(red|blue|unknown)-[0-9a-f]{6}\.json$/);
  });

  it('leaves no .tmp file behind on success', async () => {
    await store.saveReplay(makeReplay(), 'sp');
    const entries = readdirSync(join(projectRoot, '.games'));
    expect(entries.every(n => !n.endsWith('.tmp'))).toBe(true);
  });

  it('two saves of the same replay produce two distinct files', async () => {
    const replay = makeReplay();
    const a = await store.saveReplay(replay, 'sp');
    const b = await store.saveReplay(replay, 'sp');
    expect(a).not.toBe(b);
    const entries = readdirSync(join(projectRoot, '.games'));
    expect(entries.length).toBe(2);
  });
});

describe('games-store: rejection paths', () => {
  it('rejects payload with wrong format', async () => {
    const replay = makeReplay();
    replay.format = 'something-else';
    await expect(store.saveReplay(replay, 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
    expect(readdirSync(projectRoot)).not.toContain('.games');
  });

  it('rejects payload with wrong version', async () => {
    const replay = makeReplay();
    replay.version = 999;
    await expect(store.saveReplay(replay, 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
  });

  it('rejects payload missing commands array', async () => {
    const replay = makeReplay();
    delete replay.commands;
    await expect(store.saveReplay(replay, 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
  });

  it('rejects payload with bogus winner', async () => {
    const replay = makeReplay();
    replay.result.winner = 'purple';
    await expect(store.saveReplay(replay, 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
  });

  it('rejects unknown mode', async () => {
    await expect(store.saveReplay(makeReplay(), 'spectator')).rejects.toThrow(/mode/);
  });

  it('rejects non-object payloads', async () => {
    await expect(store.saveReplay(null, 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
    await expect(store.saveReplay([1, 2, 3], 'sp')).rejects.toBeInstanceOf(ReplayValidationError);
  });
});

describe('games-store: construction', () => {
  it('rejects a relative projectRoot', () => {
    expect(() => createGamesStore({ projectRoot: 'relative/path' })).toThrow(/absolute/);
  });
});
