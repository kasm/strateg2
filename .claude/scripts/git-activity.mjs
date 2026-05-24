#!/usr/bin/env node
// git-activity.mjs — recent activity: hot files, directory churn, author distribution.

import { execSync } from 'node:child_process';
import {
  getProjectRoot, rel, parseArgs, writeOut, mdTable,
  getTargetPath, getOutPath, header,
} from './_shared.mjs';
import { resolve, relative, sep } from 'node:path';

const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);
const limit = parseInt(args.flags.limit ?? '50', 10);
const topN = parseInt(args.flags.top ?? '25', 10);

const out = [];
out.push(header(`Git activity (last ${limit} commits)`, target, root));

let isRepo = false;
try {
  execSync('git rev-parse --is-inside-work-tree', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  isRepo = true;
} catch { /* not a repo */ }

if (!isRepo) {
  out.push('_(not a git repository — nothing to report)_');
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

// Recent commits
let log = '';
try {
  log = execSync(`git log -n ${limit} --pretty=format:"%h|%an|%ad|%s" --date=short`,
    { cwd: root, encoding: 'utf8' });
} catch (e) {
  out.push(`_(git log failed: ${e.message})_`);
  writeOut(out.join('\n'), getOutPath(args));
  process.exit(0);
}

const commits = log.split('\n').filter(Boolean).map(line => {
  const [hash, author, date, ...rest] = line.split('|');
  return { hash, author, date, msg: rest.join('|') };
});

out.push('## Recent commits\n');
out.push(mdTable(['Hash', 'Date', 'Author', 'Message'],
  commits.slice(0, Math.min(20, commits.length)).map(c => [c.hash, c.date, c.author, c.msg])));

// Hot files (by number of changes)
const fileChurn = {};
let nameStat = '';
try {
  nameStat = execSync(`git log -n ${limit} --name-only --pretty=format:""`,
    { cwd: root, encoding: 'utf8' });
} catch {}
for (const line of nameStat.split('\n')) {
  const f = line.trim();
  if (!f) continue;
  fileChurn[f] = (fileChurn[f] || 0) + 1;
}

const targetRel = relative(root, target).split(sep).join('/');
const inTarget = (f) => !targetRel || f === targetRel || f.startsWith(targetRel + '/');

const hotFiles = Object.entries(fileChurn)
  .filter(([f]) => inTarget(f))
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN);

out.push(`\n## Hot files (top ${hotFiles.length} by commit count)\n`);
out.push(mdTable(['File', 'Commits touching it'], hotFiles));

// Directory churn
const dirChurn = {};
for (const [f, n] of Object.entries(fileChurn)) {
  if (!inTarget(f)) continue;
  const dir = f.includes('/') ? f.split('/').slice(0, 2).join('/') : '(root)';
  dirChurn[dir] = (dirChurn[dir] || 0) + n;
}
const hotDirs = Object.entries(dirChurn).sort((a, b) => b[1] - a[1]).slice(0, 15);
out.push('\n## Hot directories (top-2-level)\n');
out.push(mdTable(['Directory', 'Touches'], hotDirs));

// Authors
const authorCount = {};
for (const c of commits) authorCount[c.author] = (authorCount[c.author] || 0) + 1;
const authors = Object.entries(authorCount).sort((a, b) => b[1] - a[1]);
out.push('\n## Authors\n');
out.push(mdTable(['Author', 'Commits'], authors));

writeOut(out.join('\n'), getOutPath(args));
