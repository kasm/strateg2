#!/usr/bin/env node
// context.mjs — aggregator: runs a subset of analyzers and writes one consolidated markdown.
// Usage:
//   node .claude/scripts/context.mjs                     # project-wide overview
//   node .claude/scripts/context.mjs src/modules/foo     # focused slice
//   node .claude/scripts/context.mjs --out custom.md     # custom output path

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getProjectRoot, parseArgs, rel, getTargetPath,
} from './_shared.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv);
const root = getProjectRoot();
const target = getTargetPath(args, root);
const isProjectWide = target === root;

const scriptsOrder = isProjectWide
  ? ['structure', 'deps', 'graph', 'symbols', 'client-server', 'routes', 'events', 'assets', 'complexity', 'todos', 'git-activity']
  : ['structure', 'symbols', 'graph', 'client-server', 'events', 'complexity', 'todos'];

const targetArg = isProjectWide ? null : rel(target, root);

const sections = [];
sections.push(`# Project context: ${isProjectWide ? '(whole project)' : targetArg}`);
sections.push(`_Generated: ${new Date().toISOString()}_`);
sections.push('');
sections.push(`Aggregated from: ${scriptsOrder.join(', ')}`);
sections.push('');

for (const name of scriptsOrder) {
  const scriptPath = join(here, `${name}.mjs`);
  const argv = targetArg ? [scriptPath, targetArg] : [scriptPath];
  process.stderr.write(`[context] running ${name}.mjs...\n`);
  try {
    const stdout = execFileSync(process.execPath, argv, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    sections.push('---\n');
    sections.push(stdout.trim());
    sections.push('');
  } catch (e) {
    sections.push('---\n');
    sections.push(`## ${name}\n\n**Error running ${name}.mjs:** ${e.message}\n`);
  }
}

// Resolve output path
let outPath;
if (typeof args.flags.out === 'string') {
  outPath = resolve(root, args.flags.out);
} else {
  const safe = isProjectWide ? 'project' : targetArg.replace(/[\\/]/g, '_').replace(/^_+|_+$/g, '') || 'target';
  outPath = join(root, '.claude', 'context', `${safe}.md`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, sections.join('\n') + '\n', 'utf8');
process.stderr.write(`[context] wrote ${rel(outPath, root)} (${(sections.join('\n').length / 1024).toFixed(1)} KB)\n`);
process.stdout.write(rel(outPath, root) + '\n');
