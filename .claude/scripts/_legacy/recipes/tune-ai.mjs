#!/usr/bin/env node
// Recipe: tune-ai. For adjusting AI decider behavior (att/def/adaptive/utility/hybrid).
import { emitRecipe } from './_emit.mjs';

emitRecipe({
  name: 'tune-ai',
  task: `
Use this bundle when adjusting AI behavior — fixed-script (att/def), adaptive,
utility-scored, or hybrid. AI runs in the \`aiUpdate\` phase and is throttled by
\`config.ai.decideEvery\` / \`config.ai.microEvery\`.

## Read first
- \`src/modules/ai/index.js\` — public API, DECIDERS registry, micro sub-tick logic.
- The decider you want to tune: \`src/modules/ai/decision-<type>.internal.js\`.
- Shared helpers used across deciders:
  - \`assess.internal.js\` — situation snapshot
  - \`memory.internal.js\` — persistent per-side AI memory
  - \`common.internal.js\` — assignIdlePeasants, garrisonIdleArchers
  - \`build-order.internal.js\` — placement of buildings (findGrassSpot)
- \`src/core/config.js\` — AI parameters (decideEvery, microEvery, weights)

## Architectural rule that matters here
AI does NOT mutate sim state directly: it inspects state read-only and submits
commands via \`deps.commands.submit({type:..., playerId, ...})\`. The legacy
inline-mutation carve-out (commands/index.js:13) is being phased out; new AI
logic should go through commands.

## Respect (CI-enforced)
- **P7 single-writer**: ai/** is currently in the allowlist as a legacy carve-out.
  New code should still submit commands rather than mutate inline.
- **P8 determinism**: no \`Math.random\` — utility scoring must be a pure function
  of the assess snapshot. Determinism is what makes replay+MP work.
- **P5 internals**: AI internals live in \`*.internal.js\`. Don't reach into them
  from other modules.

## Verify after change
- \`tests/ai.test.js\` and \`tests/ai-complex.test.js\` cover AI decisions.
- \`npm run check\` — the determinism check will catch any \`Math.random\` you slip in.
`,
  paths: [
    'src/modules/ai',
    'src/core/config.js',
    'src/commands/index.js',
  ],
});
