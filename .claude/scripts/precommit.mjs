#!/usr/bin/env node
// Pre-commit gate. Authoritative point before history is written.
//
// Runs the three architectural guards (P5/P7/P8) plus a scoped vitest pass
// (only files affected by the staged change). Designed to stay under ~10s on
// a warm cache so devs don't reach for `--no-verify`.
//
// Invoked via simple-git-hooks (see package.json), or directly with:
//   node .claude/scripts/precommit.mjs

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: false });
  if (r.status !== 0) {
    process.stderr.write(`\n[precommit] ${label} FAILED\n`);
    if (r.stdout) process.stderr.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    return false;
  }
  return true;
}

function stagedFiles() {
  const r = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
    cwd: ROOT, encoding: 'utf8',
  });
  if (r.status !== 0) {
    process.stderr.write('[precommit] could not read staged files (is this a git repo?)\n');
    return [];
  }
  return r.stdout.split(/\r?\n/).filter(Boolean);
}

const staged = stagedFiles();
if (staged.length === 0) {
  // Nothing staged — vacuously pass. Hook should not block an empty commit
  // (git itself does that).
  process.exit(0);
}

const touchesSrc = staged.some((f) => f.startsWith('src/'));
const touchesTests = staged.some((f) => f.startsWith('tests/'));
const onlyDocsOrCI = staged.every(
  (f) => f.endsWith('.md') || f.startsWith('.github/') || f.startsWith('docs/'),
);

if (onlyDocsOrCI) {
  process.exit(0);
}

const failures = [];

if (touchesSrc) {
  if (!run('P5 internals', process.execPath, [resolve(ROOT, '.claude/scripts/check-internals.mjs')])) {
    failures.push('P5');
  }
  if (!run('P7 single-writer', process.execPath, [resolve(ROOT, '.claude/scripts/check-single-writer.mjs')])) {
    failures.push('P7');
  }
  if (!run('P8 determinism', process.execPath, [resolve(ROOT, '.claude/scripts/check-determinism.mjs')])) {
    failures.push('P8');
  }
}

if (touchesSrc || touchesTests) {
  // vitest --changed runs only tests related to files changed vs HEAD
  // (which, for a pre-commit run, is the staged set).
  if (!run('vitest --changed', 'npx', ['--yes', 'vitest', 'run', '--changed', 'HEAD'])) {
    failures.push('tests');
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `\n[precommit] ${failures.length} check(s) failed: ${failures.join(', ')}\n` +
    `Fix the violations above, re-stage, and commit again.\n` +
    `Bypass only in an emergency with: git commit --no-verify\n`,
  );
  process.exit(1);
}

process.exit(0);
