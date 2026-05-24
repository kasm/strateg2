#!/usr/bin/env node
// replay.mjs — expand a saved replay into an LLM-friendly match report.
//
// Usage:
//   node .claude/scripts/replay.mjs <replay.json> [--every <ticks>]
//
// CLI wrapper around the shared report builder in _replay-report.mjs (also
// used by .claude/mcp/replay/handlers.mjs). Output here must remain
// byte-identical to the MCP `replay.analyze` tool — the parity is asserted
// by tests/mcp-replay.test.js.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReport } from './_replay-report.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const everyArg = args.indexOf('--every');
const EVERY = everyArg >= 0 ? Math.max(1, parseInt(args[everyArg + 1], 10) || 0) : 300;

if (!file) {
  console.error('usage: node .claude/scripts/replay.mjs <replay.json> [--every <ticks>]');
  process.exit(1);
}

const replay = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (replay.format !== 'strateg2-replay') {
  console.error(`not a strateg2 replay: ${file}`);
  process.exit(1);
}

console.log(buildReport(replay, { label: file, every: EVERY }));
