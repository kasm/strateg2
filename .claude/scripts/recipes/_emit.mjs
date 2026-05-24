// Shared helper for recipes — emits a task-templated context bundle.
//
// Each recipe imports `emitRecipe({ name, task, paths })` and provides:
//   name : kebab-case recipe id ('modify-unit', 'add-command', ...)
//   task : the prose task brief (constraints, read order, anti-patterns)
//   paths: file/dir globs that context.mjs should aggregate
//
// Output: .claude/context/recipe-<name>.md
//
// Implementation: for each path, runs context.mjs to produce its markdown, then
// concatenates them with the task brief at the top. The result is a single
// self-contained markdown the agent can feed into a fresh conversation.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = dirname(HERE);
const ROOT = dirname(dirname(SCRIPTS));

export function emitRecipe({ name, task, paths }) {
  const contextDir = join(ROOT, '.claude', 'context');
  mkdirSync(contextDir, { recursive: true });

  const sections = [`# Recipe: ${name}`, '', task.trim(), ''];

  for (const target of paths) {
    process.stderr.write(`[recipe:${name}] aggregating ${target}...\n`);
    try {
      execFileSync(process.execPath, [join(SCRIPTS, 'context.mjs'), target], {
        cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'ignore', 'pipe'],
      });
      const safe = target.replace(/[\\/]/g, '_').replace(/^_+|_+$/g, '');
      const generated = join(contextDir, `${safe}.md`);
      if (existsSync(generated)) {
        sections.push(`---`, '', `## Context for \`${target}\``, '', readFileSync(generated, 'utf8').trim(), '');
      } else {
        sections.push(`---`, '', `## Context for \`${target}\``, '', `_(context.mjs ran but produced no file at ${generated})_`, '');
      }
    } catch (e) {
      sections.push(`---`, '', `## Context for \`${target}\``, '', `_Error running context.mjs ${target}: ${e.message}_`, '');
    }
  }

  const outPath = join(contextDir, `recipe-${name}.md`);
  writeFileSync(outPath, sections.join('\n'));
  console.log(`[recipe:${name}] wrote ${resolve(outPath)}`);
}
