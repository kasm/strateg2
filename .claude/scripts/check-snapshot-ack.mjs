#!/usr/bin/env node
// P6/P9 snapshot-drift ack gate.
//
// Invariant: any change to a `tests/**/*.snap` file vs `main` requires an
// explicit, dated `SNAPSHOT_ACK.md` at the repo root that names every
// changed file. Snapshots are part of the public-surface (P6) and
// phase-order (P9) contracts — they should never change silently because
// "vitest regenerated them".
//
// Exit codes:
//   0 - no snapshot changes, or every changed snapshot is acknowledged
//   1 - snapshot changes exist but ack is missing or incomplete
//
// Gracefully exits 0 if `main` is not available locally (e.g. fresh clone
// with a shallow checkout) — the CI job is the authoritative gate in that
// case.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function findBaseRef() {
  // Prefer local main, then origin/main. If neither resolves, return null.
  for (const ref of ['main', 'origin/main']) {
    const sha = git(['rev-parse', '--verify', '--quiet', ref]);
    if (sha) return ref;
  }
  return null;
}

const baseRef = findBaseRef();
if (!baseRef) {
  // Nothing to compare against. CI with fetch-depth: 0 will have it.
  process.exit(0);
}

const head = git(['rev-parse', 'HEAD']);
const base = git(['rev-parse', baseRef]);
if (!head || !base || head === base) {
  // On the base branch itself, or repo state is too narrow to compute.
  process.exit(0);
}

const changed = git(['diff', '--name-only', `${baseRef}...HEAD`, '--', 'tests/']);
if (changed === null) {
  process.exit(0);
}
const changedSnaps = changed
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && /\.snap$/.test(s));

if (changedSnaps.length === 0) {
  process.exit(0);
}

const ackPath = resolve(ROOT, 'SNAPSHOT_ACK.md');
if (!existsSync(ackPath)) {
  process.stderr.write(
    `\nSNAPSHOT_ACK gate FAILED:\n` +
    `  ${changedSnaps.length} snapshot file(s) changed vs ${baseRef}, but SNAPSHOT_ACK.md is missing.\n\n` +
    changedSnaps.map((p) => `    - ${p}`).join('\n') +
    `\n\nWhy: snapshots encode the P6 public-surface (tests/public-surfaces.test.js) and\n` +
    `P9 phase order (tests/phase-order.test.js) contracts. They must not change silently.\n\n` +
    `Fix: copy SNAPSHOT_ACK.template.md to SNAPSHOT_ACK.md, today's date, one bullet per file above.\n`,
  );
  process.exit(1);
}

const ack = readFileSync(ackPath, 'utf8');

// Today's date in YYYY-MM-DD per local timezone.
// (Determinism guard P8 forbids `new Date()` only in src/. This is tooling.)
const today = new Date().toISOString().slice(0, 10);
if (!ack.includes(today)) {
  process.stderr.write(
    `\nSNAPSHOT_ACK gate FAILED:\n` +
    `  SNAPSHOT_ACK.md exists but does not contain today's date (${today}).\n` +
    `  Stale acks from previous days do not justify the current snapshot diff.\n`,
  );
  process.exit(1);
}

const missing = changedSnaps.filter((p) => !ack.includes(p));
if (missing.length > 0) {
  process.stderr.write(
    `\nSNAPSHOT_ACK gate FAILED:\n` +
    `  SNAPSHOT_ACK.md is missing entries for ${missing.length} changed snapshot(s):\n\n` +
    missing.map((p) => `    - ${p}`).join('\n') +
    `\n\nAdd a bullet for each, with a one-line justification.\n`,
  );
  process.exit(1);
}

process.stdout.write(`SNAPSHOT_ACK gate OK — ${changedSnaps.length} snapshot(s) acknowledged for ${today}.\n`);
process.exit(0);
