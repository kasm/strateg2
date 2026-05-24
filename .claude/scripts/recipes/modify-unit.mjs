#!/usr/bin/env node
// Recipe: modify-unit. For adding or tweaking unit behavior (combat, logistics, movement).
import { emitRecipe } from './_emit.mjs';

emitRecipe({
  name: 'modify-unit',
  task: `
Use this bundle when adding or tweaking a unit's behavior: combat resolution,
state machines (gather/haul/move/attack), or stat-driven mechanics.

## Read first
- \`src/modules/units/index.js\` — public API + how units module wires its deps
- The specific \`src/modules/units/<unit>.internal.js\` for the behavior you change
- \`src/core/stats.js\` — \`unitStat()\` resolver. Combat reads stats through this so
  research modifiers apply automatically. Raw \`config.unit[...].<stat>\` is the bug.
- \`src/core/config.js\` — unit definitions (HP, dmg, range, cooldown, speed)
- \`src/modules/combat/index.js\` — if your change touches damage application

## Respect (CI-enforced)
- **P7 single-writer**: sim-state mutations only inside src/modules/units/** and
  src/commands/**. Do not write \`state.X = ...\` from anywhere else.
- **P8 determinism**: no \`Math.random\` / \`Date.now\` / \`performance.now\` /
  \`new Date(...)\` in the sim path. If you need randomness, introduce a seeded
  RNG sourced from state.
- **P5 internals**: do not import another module's \`*.internal.js\` files —
  go through its \`index.js\` public surface.
- **P9 phase order**: per-unit work happens in the \`unitsUpdate\` phase. Do not
  reorder phases or insert work into other phases.

## Verify after change
- \`npm test\` (the replay test catches determinism regressions)
- \`npm run check\` (P5/P7/P8 guards)
`,
  paths: [
    'src/modules/units',
    'src/modules/combat',
    'src/core/stats.js',
    'src/core/config.js',
  ],
});
