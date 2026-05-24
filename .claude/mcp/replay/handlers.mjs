// Pure tool handlers for the replay MCP server.
//
// `replay.analyze` and `replay.verify` import `reconstructReplay` directly
// from src/replay/reconstruct.js (via the shared builder in
// .claude/scripts/_replay-report.mjs) — no shelling out. `replay.diff` runs
// two reconstructions to compute checksum and command-stream divergence.
//
// HARD INVARIANT — read-only by construction:
//   No handler in this file writes to disk. All file reads are gated by
//   `validatePath` which restricts inputs to repo-relative .json paths.

import { readFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReport, verifyReplay, diffReplays } from '../../scripts/_replay-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');

function validatePath(p, field = 'path') {
  if (typeof p !== 'string' || p.length === 0) throw new Error(`${field} must be a non-empty string`);
  if (!p.toLowerCase().endsWith('.json')) throw new Error(`${field} must end with .json`);
  const abs = resolve(ROOT, p);
  const rel = relative(ROOT, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${field} must resolve under the repo root`);
  return abs;
}

function readReplay(absPath) {
  const txt = readFileSync(absPath, 'utf8');
  const replay = JSON.parse(txt);
  if (replay.format !== 'strateg2-replay') throw new Error(`not a strateg2 replay: ${absPath}`);
  return replay;
}

export const HANDLERS = {
  'replay.analyze': async ({ path, every = 300 } = {}) => {
    const abs = validatePath(path, 'path');
    const replay = readReplay(abs);
    return { markdown: buildReport(replay, { label: path, every }) };
  },

  'replay.verify': async ({ path } = {}) => {
    const abs = validatePath(path, 'path');
    const replay = readReplay(abs);
    return verifyReplay(replay);
  },

  'replay.diff': async ({ a, b } = {}) => {
    const absA = validatePath(a, 'a');
    const absB = validatePath(b, 'b');
    const replayA = readReplay(absA);
    const replayB = readReplay(absB);
    return diffReplays(replayA, replayB);
  },
};

export const TOOL_SPECS = [
  {
    name: 'replay.analyze',
    description: 'Expand a saved strateg2 replay into an LLM-friendly markdown report (header, command summary, event timeline, keyframes, determinism check).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative path to a strateg2 replay .json file.' },
        every: { type: 'number', description: 'Keyframe interval in ticks (default 300).' },
      },
      required: ['path'],
    },
  },
  {
    name: 'replay.verify',
    description: 'Verify that a replay reconstructs deterministically. Returns {verified, finalTick, winner, checksum}.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'replay.diff',
    description: 'Tick-by-tick diff between two replays. Returns first divergence in the command stream and the state-checksum trail.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'string', description: 'Repo-relative path to replay A.' },
        b: { type: 'string', description: 'Repo-relative path to replay B.' },
      },
      required: ['a', 'b'],
    },
  },
];
