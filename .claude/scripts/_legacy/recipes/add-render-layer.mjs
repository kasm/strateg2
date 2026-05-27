#!/usr/bin/env node
// Recipe: add-render-layer. For adding a new visual layer (overlay, HUD, debug viz).
import { emitRecipe } from './_emit.mjs';

emitRecipe({
  name: 'add-render-layer',
  task: `
Use this bundle when adding or modifying a rendering layer. Rendering is at the
edge — it READS sim state (entities, projectiles, map) and draws to canvas. It
must never mutate sim state.

## Read first
- \`src/modules/render/index.js\` — public API, scene composition
- The specific scene/HUD file you're touching (scene.js, hud.js, minimap.js, etc.)
- \`src/client/camera.js\` — viewport transform; render code uses camera.state
- \`src/client/bootstrap.js\` — RAF loop that calls render each frame
- \`src/modules/entities/index.js\` — queries you'll use to find what to draw

## Respect (CI-enforced)
- **P7 single-writer**: render code is OUTSIDE the allowlist. You may NOT write
  to \`state.entities\`, \`state.projectiles\`, etc. Only read.
- **P8 determinism**: not enforced for render (it's at the edge), but avoid
  introducing client-side state that the sim depends on.
- **P5 internals**: render's own internals can become \`*.internal.js\`. Don't
  import other modules' internals.

## Common patterns
- Use camera tile↔pixel helpers, don't reinvent.
- Iterate \`w.state.entities\` for live entities; \`w.entities.unitsOf(owner)\` /
  \`buildingsOf(owner)\` for filtered queries.
- For HUD: read selectedIds from clientState, not sim state.

## Verify after change
- No automated test for render (it's DOM-bound). Run \`npm run start\` and inspect
  visually. The fixed RAF loop catches most regressions.
- \`npm run check\` will fail if you accidentally mutate sim state.
`,
  paths: [
    'src/modules/render',
    'src/client',
    'src/modules/entities/index.js',
  ],
});
