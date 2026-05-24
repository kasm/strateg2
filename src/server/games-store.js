// Persists finished-match replays under <projectRoot>/.games/ as JSON.
//
// Validation: payload must declare the same format/version as recorder.js
// emits — otherwise it's not a replay we can reconstruct, so we reject before
// touching disk.
//
// Atomicity: write to <file>.tmp then rename. A crash mid-write never leaves
// a half-file readable by reconstruct.js.
//
// Filename: <recordedAt>-<mode>-<winner>-<rand>.json, with recordedAt's `:`/`.`
// flattened to `-` (Windows-unsafe). One file per match, never overwritten —
// on the astronomically unlikely rand collision we re-roll instead of clobbering.

import { promises as fs } from 'node:fs';
import { randomBytes }    from 'node:crypto';
import path               from 'node:path';

import { REPLAY_FORMAT, REPLAY_VERSION } from '../replay/recorder.js';

const VALID_MODES   = new Set(['sp', 'mp']);
const VALID_WINNERS = new Set(['red', 'blue', null]);
const MAX_REROLLS   = 8;

/**
 * @param {{ projectRoot: string, dirName?: string }} opts
 * @returns {{ saveReplay: (replay: object, mode: 'sp'|'mp') => Promise<string> }}
 *   `saveReplay` resolves with the absolute path of the written file.
 */
export function createGamesStore({ projectRoot, dirName = '.games' }) {
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    throw new Error('createGamesStore: projectRoot must be an absolute path');
  }
  const dir = path.join(projectRoot, dirName);

  async function saveReplay(replay, mode) {
    if (!VALID_MODES.has(mode)) {
      throw new Error(`saveReplay: mode must be 'sp' or 'mp', got ${JSON.stringify(mode)}`);
    }
    validateReplay(replay);

    await fs.mkdir(dir, { recursive: true });

    const winner = replay.result.winner ?? 'unknown';
    const stamp  = sanitizeStamp(replay.recordedAt);
    const body   = JSON.stringify(replay);

    for (let attempt = 0; attempt < MAX_REROLLS; attempt++) {
      const rand    = randomBytes(3).toString('hex'); // 6 hex chars
      const name    = `${stamp}-${mode}-${winner}-${rand}.json`;
      const final   = path.join(dir, name);
      const tmp     = `${final}.tmp`;
      try {
        // wx = fail if file exists. With the random suffix this is collision insurance.
        const fh = await fs.open(tmp, 'wx');
        try { await fh.writeFile(body); } finally { await fh.close(); }
        await fs.rename(tmp, final);
        return final;
      } catch (err) {
        if (err.code === 'EEXIST') continue; // re-roll
        throw err;
      }
    }
    throw new Error(`saveReplay: could not find a free filename after ${MAX_REROLLS} attempts`);
  }

  return { saveReplay };
}

function validateReplay(replay) {
  if (!replay || typeof replay !== 'object' || Array.isArray(replay)) {
    throw new ReplayValidationError('replay must be a JSON object');
  }
  if (replay.format !== REPLAY_FORMAT) {
    throw new ReplayValidationError(`unexpected format: ${JSON.stringify(replay.format)} (want ${JSON.stringify(REPLAY_FORMAT)})`);
  }
  if (replay.version !== REPLAY_VERSION) {
    throw new ReplayValidationError(`unsupported version: ${JSON.stringify(replay.version)} (want ${REPLAY_VERSION})`);
  }
  if (!replay.result || !VALID_WINNERS.has(replay.result.winner ?? null)) {
    throw new ReplayValidationError(`result.winner must be 'red', 'blue', or null`);
  }
  if (!Array.isArray(replay.commands)) {
    throw new ReplayValidationError('commands must be an array');
  }
  if (typeof replay.recordedAt !== 'string' || replay.recordedAt.length === 0) {
    throw new ReplayValidationError('recordedAt must be a non-empty ISO timestamp string');
  }
}

// Marker class so callers (the http endpoint) can distinguish a 400-worthy
// validation failure from a 500-worthy disk error without inspecting messages.
export class ReplayValidationError extends Error {
  constructor(msg) { super(msg); this.name = 'ReplayValidationError'; }
}

function sanitizeStamp(iso) {
  // ISO timestamps contain `:` and `.`, both Windows-unsafe in filenames.
  // Replace any run of non-filename chars with `-` and strip trailing `Z` for brevity.
  return String(iso).replace(/[^0-9A-Za-z]+/g, '-').replace(/-+$/, '');
}
