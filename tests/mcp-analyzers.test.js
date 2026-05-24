// Contract test for the analyzers MCP server.
//
// Asserts byte-for-byte parity between each MCP tool's output and a direct
// CLI invocation of the underlying analyzer script. This guarantees the MCP
// surface is a faithful proxy — adding a wrapper that mutates output (or
// silently drops the script) fails CI.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HANDLERS } from '../.claude/mcp/analyzers/handlers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function runCli(scriptRel, args = []) {
  const r = spawnSync(
    process.execPath,
    [resolve(ROOT, scriptRel), ...args],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error(`CLI ${scriptRel} failed: ${r.stderr}`);
  }
  return r.stdout;
}

// The analyzers embed an ISO timestamp `_Generated: <date>_` which differs
// between the two calls in a parity test. Strip it so the comparison checks
// content, not call time.
function normalize(s) {
  return s.replace(/^_Generated: .*_$/m, '_Generated: <stripped>_');
}

describe('mcp/analyzers — CLI parity', () => {
  // Pick a small, deterministic target so the diff (if any) is readable.
  const target = 'src/sim';

  it('analyze.structure matches CLI', async () => {
    const viaMcp = (await HANDLERS['analyze.structure']({ target })).markdown;
    const direct = runCli('.claude/scripts/structure.mjs', [target]);
    expect(normalize(viaMcp)).toBe(normalize(direct));
  });

  it('analyze.symbols matches CLI', async () => {
    const viaMcp = (await HANDLERS['analyze.symbols']({ target })).markdown;
    const direct = runCli('.claude/scripts/symbols.mjs', [target]);
    expect(normalize(viaMcp)).toBe(normalize(direct));
  });

  it('analyze.complexity matches CLI', async () => {
    const viaMcp = (await HANDLERS['analyze.complexity']({ target })).markdown;
    const direct = runCli('.claude/scripts/complexity.mjs', [target]);
    expect(normalize(viaMcp)).toBe(normalize(direct));
  });

  it('analyze.todos matches CLI', async () => {
    const viaMcp = (await HANDLERS['analyze.todos']({ target })).markdown;
    const direct = runCli('.claude/scripts/todos.mjs', [target]);
    expect(normalize(viaMcp)).toBe(normalize(direct));
  });

  it('analyze.refs matches CLI', async () => {
    const viaMcp = (await HANDLERS['analyze.refs']({ name: 'createSimWorld' })).markdown;
    const direct = runCli('.claude/scripts/refs.mjs', ['createSimWorld']);
    expect(normalize(viaMcp)).toBe(normalize(direct));
  });
});

describe('mcp/analyzers — input validation', () => {
  it('rejects target with ".."', async () => {
    await expect(HANDLERS['analyze.structure']({ target: '../etc' })).rejects.toThrow(/\.\./);
  });

  it('rejects absolute target', async () => {
    await expect(HANDLERS['analyze.structure']({ target: '/etc/passwd' })).rejects.toThrow(/repo-relative/);
  });

  it('rejects refs name that is not a JS identifier', async () => {
    await expect(HANDLERS['analyze.refs']({ name: 'rm -rf /' })).rejects.toThrow(/identifier/);
  });
});
