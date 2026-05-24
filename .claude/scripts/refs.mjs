#!/usr/bin/env node
// refs.mjs — find references to a symbol by name (regex, with caveat note).
// Usage: node .claude/scripts/refs.mjs <symbolName> [targetPath]

import {
  getProjectRoot, walkFiles, rel, parseArgs, writeOut, mdTable,
  safeReadFile, getTargetPath, getOutPath, header, JS_EXTS,
} from './_shared.mjs';

const args = parseArgs(process.argv);
const root = getProjectRoot();

const name = args._[0];
const targetArg = args._[1];
const target = targetArg ? getTargetPath({ _: [targetArg] }, root) : root;

const out = [];

if (!name) {
  out.push('# refs.mjs\n\n**Usage:** `node .claude/scripts/refs.mjs <symbolName> [targetPath]`\n');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(1);
}

if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
  out.push(`# refs.mjs\n\n**Error:** \`${name}\` is not a valid JS identifier. This tool searches by identifier name only.\n`);
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(1);
}

const re = new RegExp(`\\b${escapeRe(name)}\\b`, 'g');
const hits = [];
const filesScanned = [];

for (const f of walkFiles(target, { extensions: [...JS_EXTS, '.html', '.htm'] })) {
  const src = safeReadFile(f);
  if (!src) continue;
  filesScanned.push(f);
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      re.lastIndex = 0;
      hits.push({ file: rel(f, root), line: i + 1, text: lines[i].trim().slice(0, 160) });
    }
    re.lastIndex = 0;
  }
}

out.push(header(`References to \`${name}\``, target, root));
out.push(`_Searched ${filesScanned.length} files. Regex-based — may include false positives (comments, strings, unrelated identifiers with same name). Use an LSP for ground truth._\n`);

if (!hits.length) {
  out.push('_(no references found)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const byFile = {};
for (const h of hits) {
  byFile[h.file] ||= 0;
  byFile[h.file]++;
}

out.push(`## ${hits.length} hits in ${Object.keys(byFile).length} files\n`);
out.push(mdTable(['File', 'Hits'],
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).map(([f, n]) => [f, n])));

out.push('\n## All locations\n');
out.push(mdTable(['Location', 'Snippet'], hits.map(h => [`${h.file}:${h.line}`, h.text])));

writeOut(out.join('\n'), getOutPath(args));

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
