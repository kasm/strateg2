#!/usr/bin/env node
// Recipe: add-command. For introducing a new command type into the dispatcher.
import { emitRecipe } from './_emit.mjs';

emitRecipe({
  name: 'add-command',
  task: `
Use this bundle when introducing a new command type. Commands are the SOLE
sanctioned writer to sim state outside per-tick simulation steps. Input + AI +
(future) network all funnel through \`commands.submit()\`.

## Read first
- \`src/commands/index.js\` — dispatcher, the DEFS registry. Adding a command =
  adding a key here.
- An existing internal as a template, e.g. \`src/commands/build.internal.js\` for a
  resource-spending command, \`src/commands/order.internal.js\` for a unit-targeting
  command.
- \`src/core/game-state.js\` — what fields exist on sim state. validate() reads them,
  apply() mutates them.
- The module(s) your command will mutate (entities, units, map, etc.) — go through
  their \`index.js\` API only.

## Shape of a command file (\`src/commands/<type>.internal.js\`)
- \`validateXxx(deps, cmd)\` — pure read; returns \`{ok:true}\` or \`{ok:false, reason}\`.
- \`applyXxx(deps, cmd)\` — the mutation. The dispatcher records ONLY applied cmds.

## Respect (CI-enforced)
- **P7 single-writer**: \`apply()\` is the only place that mutates sim state for
  this command type. The validate is read-only.
- **P8 determinism**: validate + apply must be pure functions of (state, cmd).
  No \`Math.random\` / \`Date.now\` / \`performance.now\`.
- **Per-tick ordering**: commands sort by (playerId, seq). Your apply will run in
  deterministic order — don't add ordering logic of your own.
- **P5 internals**: name the file \`<type>.internal.js\` (only the dispatcher imports it).

## Verify after change
- Add a unit test that submits + drains your command and asserts the state change.
- \`npm test\` (replay must still pass — new command types are recorded automatically).
- \`npm run check\`
`,
  paths: [
    'src/commands',
    'src/core/game-state.js',
    'src/core/world.js',
  ],
});
