// Invariant guard: simulation code outside the map module must never read
// `config.mapW` or `config.mapH` — dimensions belong to the live map instance
// (`map.w` / `map.h`) so a future per-game map size flows through.
//
// Strict architectural seam — see memory/feedback_strict_architectural_seams.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// `config.mapW` / `config.mapH` is only legitimate in two places:
//   - src/core/config.js          — the declaration itself
//   - src/modules/map/index.js    — the fallback inside createMap
const allowed = new Set([
  path.join('src', 'core', 'config.js'),
  path.join('src', 'modules', 'map', 'index.js'),
]);

function listJs(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, e.name);
    if (e.isDirectory()) out.push(...listJs(path.relative(root, p)));
    else if (e.isFile() && e.name.endsWith('.js')) out.push(path.relative(root, p));
  }
  return out;
}

describe('invariant: map dimensions read from map.w / map.h, not config', () => {
  it('no `config.mapW` / `config.mapH` outside config.js and map/index.js', () => {
    const pattern = /\bconfig\.map[WH]\b/;
    const offenders = [];
    for (const rel of listJs('src')) {
      if (allowed.has(rel)) continue;
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        const noLineComment = line.replace(/\/\/.*$/, '');
        if (/^\s*\*/.test(noLineComment)) return; // JSDoc
        if (pattern.test(noLineComment)) {
          offenders.push(`${rel}:${i + 1} ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
