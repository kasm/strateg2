// GET /api/games — list persisted replays in .games/ with the metadata the
// replay-browser modal needs (mode, winner, dims, finalTick, recordedAt).
//
// Implementation: stat the directory, read each *.json, validate format/version,
// project a small object. Files are <100KB and the directory is small, so the
// full-parse cost is fine. Repeat listings are cached by (mtime, size) of each
// file so unchanged entries are reused — a fresh ls + parse only happens on the
// files that actually changed.
//
// Sister to games-endpoint.js (POST). Returns the same (req,res)=>boolean
// chain contract.

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { REPLAY_FORMAT, REPLAY_VERSION } from '../replay/recorder.js';

/**
 * @param {{ projectRoot: string, dirName?: string }} opts
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => boolean}
 */
export function createGamesListEndpoint({ projectRoot, dirName = '.games' }) {
  if (!projectRoot || !path.isAbsolute(projectRoot)) {
    throw new Error('createGamesListEndpoint: projectRoot must be an absolute path');
  }
  const dir = path.join(projectRoot, dirName);

  /** @type {Map<string, { key: string, entry: object }>} */
  const cache = new Map();

  async function listGames() {
    let files;
    try {
      files = await fs.readdir(dir);
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }

    const out = [];
    const seen = new Set();
    for (const name of files) {
      if (!name.endsWith('.json')) continue;
      if (name.endsWith('.tmp')) continue;
      const abs = path.join(dir, name);
      let stat;
      try { stat = await fs.stat(abs); }
      catch { continue; }
      if (!stat.isFile()) continue;
      const key = `${stat.mtimeMs}:${stat.size}`;
      const cached = cache.get(name);
      if (cached && cached.key === key) {
        out.push(cached.entry);
        seen.add(name);
        continue;
      }
      let parsed;
      try {
        const body = await fs.readFile(abs, 'utf8');
        parsed = JSON.parse(body);
      } catch {
        continue; // corrupt file; skip silently
      }
      if (parsed?.format !== REPLAY_FORMAT) continue;
      if (parsed?.version !== REPLAY_VERSION) continue;
      const entry = {
        filename:   name,
        recordedAt: typeof parsed.recordedAt === 'string' ? parsed.recordedAt : null,
        mode:       inferMode(name),
        winner:     parsed.result?.winner ?? null,
        finalTick:  Number.isFinite(parsed.result?.finalTick) ? parsed.result.finalTick : null,
        mapW:       parsed.setup?.mapW ?? null,
        mapH:       parsed.setup?.mapH ?? null,
        version:    parsed.version,
      };
      cache.set(name, { key, entry });
      out.push(entry);
      seen.add(name);
    }
    // Drop cache entries for deleted files.
    for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k);

    // Newest first.
    out.sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''));
    return out;
  }

  return function gamesListEndpoint(req, res) {
    if (req.url !== '/api/games') return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false; // let POST fall through to games-endpoint

    listGames().then(list => {
      const body = JSON.stringify(list);
      res.writeHead(200, {
        'content-type':  'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'cache-control':  'no-store',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(body);
    }).catch(err => {
      console.error('[games-list-endpoint] listGames failed:', err);
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal Server Error');
    });

    return true;
  };
}

// Filename pattern (from games-store.js):
//   <stamp>-<mode>-<winner>-<rand>.json   where mode is 'sp' or 'mp'.
// We pluck the mode token rather than re-parsing the whole name; if the
// pattern ever drifts we fall back to null and the UI hides the chip.
function inferMode(name) {
  const m = name.match(/-(sp|mp)-(?:red|blue|unknown)-[0-9a-f]+\.json$/i);
  return m ? m[1] : null;
}
