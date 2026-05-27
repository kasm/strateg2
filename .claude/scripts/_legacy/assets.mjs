#!/usr/bin/env node
// assets.mjs — inventory static assets (images, audio, 3D, fonts, shaders) + where they're referenced.

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable, fmtSize,
  safeReadFile, fileStats, getTargetPath, getOutPath, header, extname, basename, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);

const CATEGORIES = {
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp', '.ico', '.avif'],
  audio: ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.opus'],
  video: ['.mp4', '.webm', '.mov'],
  '3d': ['.glb', '.gltf', '.obj', '.fbx', '.dae', '.stl', '.ply'],
  font: ['.woff', '.woff2', '.ttf', '.otf', '.eot'],
  shader: ['.glsl', '.vert', '.frag', '.wgsl'],
  data: ['.csv', '.tsv', '.geojson', '.kml', '.gpx'],
};

function categoryOf(file) {
  const ext = extname(file).toLowerCase();
  for (const [cat, exts] of Object.entries(CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return null;
}

// Pass 1: inventory
const assets = []; // { path, cat, size, ext }
const byCat = {}; // cat -> { count, size }
for (const f of walkFiles(target)) {
  const cat = categoryOf(f);
  if (!cat) continue;
  const s = fileStats(f);
  const size = s ? s.size : 0;
  assets.push({ path: rel(f, root), cat, size, ext: extname(f).toLowerCase(), name: basename(f) });
  byCat[cat] ||= { count: 0, size: 0 };
  byCat[cat].count++; byCat[cat].size += size;
}

// Pass 2: references from JS / HTML / CSS — simple substring search by basename
const refPatterns = [...JS_EXTS, '.html', '.htm', '.css'];
const refsByAsset = {}; // basename -> [file:line]
for (const f of walkFiles(target, { extensions: refPatterns })) {
  const src = safeReadFile(f);
  if (!src) continue;
  const fileRel = rel(f, root);
  // For each asset, look for basename mention; cheap but ok for moderate trees.
  for (const a of assets) {
    if (!a.name || a.name.length < 4) continue;
    // exact-ish word boundary (allow path separators around the basename)
    const idx = src.indexOf(a.name);
    if (idx === -1) continue;
    const line = src.slice(0, idx).split('\n').length;
    refsByAsset[a.path] ||= [];
    refsByAsset[a.path].push(`${fileRel}:${line}`);
  }
}

const out = [];
out.push(header('Static assets', target, root));

if (!assets.length) {
  out.push('_(no static assets detected)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

out.push('## By category\n');
out.push(mdTable(['Category', 'Files', 'Total size'],
  Object.entries(byCat).sort((a, b) => b[1].size - a[1].size)
    .map(([cat, v]) => [cat, v.count, fmtSize(v.size)])));

out.push('\n## Largest files\n');
const top = [...assets].sort((a, b) => b.size - a.size).slice(0, 25);
out.push(mdTable(['Asset', 'Category', 'Size', 'References'],
  top.map(a => {
    const refs = refsByAsset[a.path] || [];
    return [a.path, a.cat, fmtSize(a.size), refs.length ? `${refs.length} (${refs[0]})` : '_unreferenced_'];
  })));

const unreferenced = assets.filter(a => !(refsByAsset[a.path] && refsByAsset[a.path].length));
out.push(`\n## Unreferenced assets (${unreferenced.length})\n`);
out.push(unreferenced.length
  ? mdTable(['Asset', 'Category', 'Size'],
      unreferenced.slice(0, 50).map(a => [a.path, a.cat, fmtSize(a.size)]))
    + (unreferenced.length > 50 ? `\n\n_(showing 50 of ${unreferenced.length})_` : '')
  : '_(none — all assets referenced somewhere)_');

writeOut(out.join('\n'), getOutPath(args));
