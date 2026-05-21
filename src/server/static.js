// Tiny static file handler — serves files from a root directory over plain Node http.
// Browser-safe path resolution (refuses traversal outside root). No framework dep.
//
// Used by src/server/index.js to host the same index.html + src/ tree the client
// would otherwise load via file://.

import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

/**
 * @param {string} root absolute path to the directory to serve.
 * @returns {(req:import('http').IncomingMessage, res:import('http').ServerResponse) => boolean}
 *   Handler returns true if it served the request (or sent a response), false if the
 *   caller should handle it (e.g. WebSocket upgrade is handled at the server level
 *   so the static handler is never invoked for those — but we still defensively
 *   return false on non-GET so the caller can decide).
 */
export function createStaticHandler(root) {
  const rootAbs = path.resolve(root);

  return function staticHandler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain' });
      res.end('Method Not Allowed');
      return true;
    }

    const parsed = url.parse(req.url || '/');
    let rel = decodeURIComponent(parsed.pathname || '/');
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = path.normalize(path.join(rootAbs, rel));
    if (!abs.startsWith(rootAbs)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return true;
    }

    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(abs).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';

      // index.html gets a marker so the client knows it's running under the
      // Node server (vs. a bare static `npx serve .`). That toggles MP-by-default
      // in bootstrap.js without needing a `?multiplayer=1` query param.
      if (path.basename(abs).toLowerCase() === 'index.html') {
        fs.readFile(abs, 'utf8', (readErr, html) => {
          if (readErr) {
            res.writeHead(500, { 'content-type': 'text/plain' });
            res.end('Read error');
            return;
          }
          const marker = '<script>window.__STRATEG2_SERVER__=true;</script>';
          const injected = html.includes('</head>')
            ? html.replace('</head>', `  ${marker}\n</head>`)
            : marker + html;
          const buf = Buffer.from(injected, 'utf8');
          res.writeHead(200, {
            'content-type':   type,
            'content-length': buf.length,
            'cache-control':  'no-store',
          });
          if (req.method === 'HEAD') { res.end(); return; }
          res.end(buf);
        });
        return;
      }

      res.writeHead(200, {
        'content-type':   type,
        'content-length': stat.size,
        'cache-control':  'no-store',
      });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(abs).pipe(res);
    });
    return true;
  };
}
