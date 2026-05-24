// POST /api/games — accept a replay JSON from the SP client and hand it to the
// store. Returns the same (req, res) => boolean contract as static.js so the
// orchestrator can chain them.
//
// Reject reasons:
//   - 413 Payload Too Large: body exceeded MAX_BODY_BYTES before completion.
//   - 400 Bad Request: invalid JSON, or fails store.saveReplay's validation
//                       (wrong format/version, missing fields, etc).
//   - 500 Internal Server Error: disk write failed.
//
// MP games are persisted by the server's own recorder (src/server/index.js
// finishMatch), so this endpoint exists for SP only — but it does not
// distinguish: anything POSTed here is filed under mode='sp'.

import { ReplayValidationError } from './games-store.js';

const MAX_BODY_BYTES = 1 << 20; // 1 MiB — replay JSONs are tiny (command log)

/**
 * @param {{ saveReplay: (replay: object, mode: 'sp'|'mp') => Promise<string> }} store
 * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => boolean}
 *   Returns true if the request matched this endpoint (handled), false otherwise
 *   (caller should fall through to the next handler).
 */
export function createGamesEndpoint(store) {
  return function gamesEndpoint(req, res) {
    if (req.url !== '/api/games') return false;
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'text/plain', 'allow': 'POST' });
      res.end('Method Not Allowed');
      return true;
    }

    let bytes = 0;
    const chunks = [];
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413, { 'content-type': 'text/plain' });
        res.end('Payload Too Large');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', async () => {
      if (aborted) return;
      let replay;
      try {
        replay = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('Bad JSON');
        return;
      }
      try {
        await store.saveReplay(replay, 'sp');
        res.writeHead(204);
        res.end();
      } catch (err) {
        if (err instanceof ReplayValidationError) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end(`Invalid replay: ${err.message}`);
          return;
        }
        console.error('[games-endpoint] saveReplay failed:', err);
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      try { res.writeHead(400, { 'content-type': 'text/plain' }); res.end('Read error'); } catch {}
    });

    return true;
  };
}
