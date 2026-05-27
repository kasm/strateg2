#!/usr/bin/env node
// events.mjs — event handlers: DOM addEventListener, .on/.emit, inline on*, EventEmitter.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const jsPatterns = [
  { kind: 'addEventListener', re: /\.addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: 'removeEventListener', re: /\.removeEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: '.on(', re: /\b(?:socket|io|emitter|bus|ee|client|server|process|stream)\.on\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: '.once(', re: /\b\w+\.once\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: '.emit(', re: /\b(?:socket|io|emitter|bus|ee|client|server|process|stream)\.emit\s*\(\s*['"`]([^'"`]+)['"`]/g },
  { kind: 'new EventEmitter', re: /new\s+EventEmitter\s*\(/g, noEvent: true },
];

const htmlPatterns = [
  { kind: 'inline on*', re: /\bon([a-z]{3,15})\s*=\s*["'][^"']+["']/gi },
];

const hits = [];
const exts = [...JS_EXTS, '.html', '.htm'];
for (const f of walkFiles(target, { extensions: exts })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const isHtml = f.endsWith('.html') || f.endsWith('.htm');
  const pats = isHtml ? htmlPatterns : jsPatterns;
  for (const p of pats) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(src))) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({
        file: rel(f, root),
        line,
        kind: p.kind,
        event: p.noEvent ? '—' : (m[1] || '—'),
      });
    }
  }
}

const out = [];
out.push(header('Event handlers', target, root));

if (!hits.length) {
  out.push('_(no event handlers detected)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const byKind = {};
const byEvent = {};
for (const h of hits) {
  byKind[h.kind] = (byKind[h.kind] || 0) + 1;
  if (h.event !== '—') byEvent[h.event] = (byEvent[h.event] || 0) + 1;
}

out.push('## Summary by kind\n');
out.push(mdTable(['Kind', 'Count'], Object.entries(byKind).sort((a, b) => b[1] - a[1])));

out.push('\n## Top event names\n');
out.push(mdTable(['Event', 'Bindings'], Object.entries(byEvent).sort((a, b) => b[1] - a[1]).slice(0, 30)));

out.push('\n## All bindings\n');
hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
out.push(mdTable(
  ['Location', 'Kind', 'Event'],
  hits.map(h => [`${h.file}:${h.line}`, h.kind, h.event])
));

writeOut(out.join('\n'), getOutPath(args));
