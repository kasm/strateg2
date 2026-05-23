# AGENTS.md — strateg2

Operating manual for AI-assisted work in this repo. See `README.md` for the human-facing overview.

## Read first (and usually only)

For most tasks, these files are enough — do **not** load module internals unless you are modifying them.

- `src/core/config.js` — balance constants, type definitions.
- `src/core/game-state.js` — sim state shape.
- `src/core/world.js` — DI graph; tells you what depends on what.
- `src/core/game-loop.js` — canonical per-tick order.
- `src/sim/index.js` — public headless sim API.
- `src/commands/index.js` — dispatcher + invariants.

Every `src/modules/*/index.js` and `src/commands/*.js` has a JSDoc block at the top describing its public API. **Read the `index.js`, not the implementation**, when you only need to call into a module.

## Hard invariants — do not break

1. **Sim is DOM-free.** Nothing under `src/core/`, `src/sim/`, `src/commands/`, `src/transport/`, or `src/modules/{map,pathfinding,entities,units,combat,ai}/` may touch `document`, `window`, `canvas`, or `requestAnimationFrame`. DOM lives in `client/bootstrap.js`, `modules/render/`, `modules/input/`.
2. **Cross-module entity refs are numeric IDs.** Resolve via `entities.byId(id)`. Never store an entity object across ticks. Commands carry IDs, never object refs.
3. **Only the command dispatcher and per-tick sim steps mutate `state`.** Input, AI, and (future) network code submit commands via `transport.submit(...)` or `commands.submit(...)`. AI is currently the last holdout — keep new AI code on the command path.
4. **Deterministic command ordering.** Dispatcher sorts by `(playerId, seq)`. Do not introduce arrival-order processing or per-arrival side effects.
5. **Client-only fields stay out of `GameState`.** Selection, build-mode, hover tile, stack render mode live on `client/client-state.js`. Sim state must remain serializable.
6. **`entities.byId` / `state.entitiesById` is the only sanctioned ID→entity lookup.** The `entities` module is the sole keeper of that map; other modules read but do not write it.
7. **Cross-module imports go through `index.js`.** Do not import `modules/units/movement.js` from outside `modules/units/`. If you need something not exported, extend the module's `index.js` first.

## Recipes — adding things

- **New unit kind**: add to `config.unit`; create `modules/units/<kind>.js`; add a `case` in `updateUnits` switch in `modules/units/index.js`; add a sprite in `modules/render/sprites.js`; wire a train button into `index.html` + the building's `trains` array in `config.building`.
- **New building**: add to `config.building` (set `cost`, `w`, `h`, `trains`, etc.); add HUD button in `index.html`; sprite in `modules/render/sprites.js`. `commands/build.internal.js` reads `config.building` generically — usually no change needed.
- **New command type**: new file `src/commands/<name>.internal.js` exporting `validate*` and `apply*`; register in the `DEFS` map in `commands/index.js`; document the command shape in a top-of-file comment matching the existing ones.
- **Existing AI behavior**: edit `modules/ai/decision-att.internal.js` (attacker), `decision-def.internal.js` (turtle), `common.internal.js` (shared helpers), or `build-order.internal.js`; emit `commands.submit({ type:..., playerId:owner, ... })`. Do **not** mutate entities/state directly from AI.
- **New AI personality**: add `modules/ai/decision-<name>.internal.js` exporting an `aiDecide*` with the standard signature, register it in the `DECIDERS` map in `modules/ai/index.js`, and add an `<option>` to the Red/Blue AI selects in `index.html`. Per-side selection is `state.aiType` (`'off' | 'att' | 'def' | ...`).
- **Map/placement rule**: `modules/map/index.js` (`isWalkable`, `canPlaceBuilding`). Pathfinding closes over `map.isWalkable`, so a change there propagates automatically.

## Commands & workflows

- `npm test` — vitest run, Node env. Tests live under `tests/`, mirror module names.
- `npm run test:watch` — interactive.
- `npm run serve` — static dev server (via `npx serve .`).

Tests wire dependencies manually with DI — see `tests/combat.test.js` for the canonical pattern, including how it stubs the `units` module to break the units↔combat cycle. Mirror that pattern when adding tests; don't introduce a test harness.

**Single-feature flow:**
1. Read the relevant `modules/*/index.js` JSDoc.
2. Make the change inside that module; if you must touch another module, extend its public `index.js` rather than reaching into internals.
3. Add/extend a vitest under `tests/` using DI wiring.
4. Run `npm test`.

## Things to avoid breaking

- **`combat ↔ units` cycle.** Resolved by `combat.attachUnits(units)` called once in `core/world.js`. Don't `import` `units` into `combat/` files directly.
- **In-place state resets.** `entities.spawnInitial()` clears `state.entities` in place; `map.reset()` mutates `map.tiles` in place. UI captured these refs. Don't reassign them.
- **Per-tick order in `game-loop.tick()`.** The header comment is the contract. Reordering commands/AI/units/combat/prune changes determinism.
- **`Transport` shape.** Keep `submit / onSnapshot / onCommandsForTick` on `transport/local.js` so a NetTransport can drop in without client branching.
- **`entitiesById` synchronization.** Only `entities.makeUnit/makeBuilding` add to it; only `entities.pruneDead` removes from it. Don't mutate `state.entities` from elsewhere.
- **`sim/index.js` re-export surface.** Other code (and future server bootstrap) imports through this barrel. Adding here is fine; removing/renaming breaks consumers.

## Multiplayer (server) module

- `src/server/` is **Node-only**. Nothing under `src/core/`, `src/sim/`, `src/commands/`, `src/transport/`, or `src/modules/` may import from it.
- `src/transport/net.js` (`createNetTransport`) is the network adapter. It preserves the `Transport` shape from `transport/local.js` verbatim (`submit / onSnapshot / onCommandsForTick`); the bootstrap branches on which factory it instantiates and never further on mode.
- Lockstep model: server hosts the canonical tick clock, AI for empty slots, and the broadcast batch. Every peer (server's own sim + each client) advances deterministically from the same broadcast stream.
- In MP, `state.aiType.red` and `state.aiType.blue` are both `'off'` on the client so the client sim's AI never runs. AI emission lives only on the server. (In SP each side's `aiType` is `'off' | 'att' | 'def'`, chosen via the HUD's Red AI / Blue AI dropdowns; see `modules/ai/`.)
- The dispatcher's `if (cmd.seq == null)` guard at the top of `commands.submit()` is load-bearing: it lets server-stamped commands flow through untouched on the client.

## Suspicious / known-broken

- `tests/smoke-world.test.js` expects `createWorld` to return keys `['ai','combat','config','entities','input','map','pathfinding','render','state','units']` — but `core/world.js` does not wire `input` or `render` (they live in `client/bootstrap.js`). The first assertion in that file will fail. **Do not silently "fix" either side** — surface this to the user and let them decide whether the test or the contract is canonical.

## Out of scope

- Visual polish / art / sound. The sprite convention (circles=peasants, squares=swordsmen, triangles=archers; red=human, blue=AI) is intentional placeholder geometry, encoded in `modules/render/sprites.js` and `core/config.js#colors`.
- Network multiplayer implementation. The transport stub exists; the NetTransport does not.
- Build tooling / TypeScript migration. JSDoc typedefs are the current contract.
