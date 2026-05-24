#!/usr/bin/env node
// todos.mjs — scan for TODO/FIXME/HACK/XXX/NOTE markers.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, getTargetPath, getOutPath, header,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const MARKER = /\b(TODO|FIXME|HACK|XXX|NOTE)\b\s*:?\s*(.*)/;
const exts = ['.js', '.mjs', '.cjs', '.html', '.css', '.md', '.json', '.txt'];

const hits = [];
for (const f of walkFiles(target, { extensions: exts })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER);
    if (m) hits.push({ file: rel(f, root), line: i + 1, kind: m[1], text: m[2].slice(0, 120) });
  }
}

const out = [];
out.push(header('TODO / FIXME / HACK / XXX / NOTE markers', target, root));

if (!hits.length) {
  out.push('_(no markers found)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const byKind = {};
for (const h of hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
out.push('## Summary\n');
out.push(mdTable(['Kind', 'Count'], Object.entries(byKind).sort((a, b) => b[1] - a[1])));

out.push('\n## All markers\n');
out.push(mdTable(
  ['Location', 'Kind', 'Text'],
  hits.map(h => [`${h.file}:${h.line}`, h.kind, h.text])
));

writeOut(out.join('\n'), getOutPath(args));
