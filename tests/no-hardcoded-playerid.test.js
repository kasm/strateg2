// Invariant guard: command-submission paths must read client.playerId, never set
// `playerId: 'red'` (or `'blue'`) as an object literal. Otherwise an MP client
// would silently address the wrong slot.
//
// Scope: only the *command object literal* pattern. Allowed legitimate uses (JSDoc
// type comments, equality comparisons against the slot constants, default-state
// initialization) match a different syntax and are not flagged.
//
// Strict architectural seam — see memory/feedback_strict_architectural_seams.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

const scanDirs = [
  'src/modules/input',
  'src/commands',
];

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

describe('invariant: no hardcoded playerId in command-submission shapes', () => {
  it("never sets { playerId: 'red' } or { playerId: 'blue' } as an object literal", () => {
    // Matches the exact submission shape — `playerId: 'red'` or `playerId: "blue"`.
    // Does NOT match JSDoc type unions (`{string} playerId    - 'red' | 'blue'`)
    // or equality checks (`cmd.playerId !== 'red'`).
    const pattern = /playerId\s*:\s*(['"])(red|blue)\1/;
    const offenders = [];
    for (const dir of scanDirs) {
      for (const rel of listJs(dir)) {
        const src = fs.readFileSync(path.join(root, rel), 'utf8');
        const lines = src.split(/\r?\n/);
        lines.forEach((line, i) => {
          const noLineComment = line.replace(/\/\/.*$/, '');
          // Skip JSDoc lines (start with optional whitespace then *)
          if (/^\s*\*/.test(noLineComment)) return;
          if (pattern.test(noLineComment)) {
            offenders.push(`${rel}:${i + 1} ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
