# strateg2

Browser RTS prototype. Vanilla JS + Canvas + ES modules. Serverless single-player (vs. AI); architecture is prepped for a future networked transport.

## Run & test

Node 18+.

```
npm install
npm test          # vitest run (Node env)
npm run test:watch
npm run serve     # static server, then open http://localhost:3000
```

No build step — `index.html` loads `src/main.js` as a module directly.

## Architecture (one screen)

```
index.html → src/main.js → client/bootstrap.js   (DOM + RAF + restart overlay)
                               │
                               ▼
                       sim/index.js     ← public headless sim API
                               │           (createSimWorld, submitCommand,
                               │            stepTick, spawnInitial, TICK_DT)
                       core/world.js    ← DI wiring of all sim modules
                               │
   ┌── core/game-loop.tick() ──┴────────────────────────────────────┐
   │   commands.drain → ai → units → combat (projectiles+buildings) │
   │   → entities.pruneDead → checkVictory                          │
   └────────────────────────────────────────────────────────────────┘
                               ▲
                               │ (only writer of state outside per-tick)
                       src/commands/  → order | build | train | eject
                               ▲
                               │ submit()
                       transport/local.js   (shape matches future NetTransport)
                               ▲
                          input / AI
```

**Crossroads files** — read these first to understand the project:
`src/core/config.js`, `src/core/game-state.js`, `src/core/world.js`, `src/core/game-loop.js`, `src/sim/index.js`, `src/commands/index.js`.

## Folder structure

```
src/
  main.js                 entry; defers to client/bootstrap.js
  client/
    bootstrap.js          DOM + RAF loop + restart wiring (only DOM-aware sim file)
    client-state.js       UI-only state (selection, build-mode, hover, stack mode)
  core/                   orchestrators — flat, human-readable, no heavy logic
    config.js             balance constants + JSDoc typedefs
    game-state.js         shape of mutable sim state
    world.js              DI container: builds the full module graph
    game-loop.js          fixed-timestep tick(): canonical per-tick order
  sim/index.js            public headless sim API (re-exports)
  commands/               command dispatcher; sole non-tick state mutator
    index.js              submit / drain / deterministic ordering
    order.js build.js train.js eject.js   one file per command type
  transport/local.js      in-process transport; shape matches future NetTransport
  modules/                each subdir exposes only its index.js
    map/                  tile grid, placement, walkability
    pathfinding/          A*, adjacent-tile finder (closes over map.isWalkable)
    entities/             entity factory + queries + byId; owns entitiesById
    units/                peasant / melee / archer per-tick logic + movement
    combat/               melee, ranged, projectiles, building production
    ai/                   decision + build-order; talks to dispatcher, not state
    render/               canvas scene + HUD + sprites (client-only)
    input/                mouse + HUD buttons; all actions go through transport
tests/                    vitest, Node env; wires modules manually via DI
index.html  style.css  vitest.config.js  package.json
```

## Per-tick order (from `core/game-loop.js`)

1. `commands.drain()` — sort by `(playerId, seq)`, validate, apply.
2. `state.tick++`.
3. `ai.updateAI(dt)` — submits commands; throttled per-owner.
4. `units.updateUnits(dt)` — peasant / swordsman / archer per-kind dispatch.
5. `combat.updateProjectiles(dt)` — arrow movement, hits, expiry.
6. `combat.updateBuildings(dt)` — train queues + arrow production.
7. `entities.pruneDead()` then `checkVictory()`.

## Commands

| type    | file                | shape (minus `playerId/tick/seq`)                       |
|---------|---------------------|---------------------------------------------------------|
| `order` | `commands/order.js` | `{ unitIds:number[], target:{kind:'tile',x,y} \| {kind:'entity',id} }` |
| `build` | `commands/build.js` | `{ kind, tileX, tileY }`                                |
| `train` | `commands/train.js` | `{ buildingId, unitKind }`                              |
| `eject` | `commands/eject.js` | `{ buildingId }`                                        |

The dispatcher in `commands/index.js` is the **only writer to sim state outside the per-tick simulation steps**. Entity refs are numeric IDs; ordering is deterministic by `(playerId, seq)`.

## Where to make changes

| Change                | Touch                                                                 |
|-----------------------|-----------------------------------------------------------------------|
| Balance / costs / HP  | `src/core/config.js`                                                  |
| New unit kind         | `config.unit` + `modules/units/<kind>.js` + switch in `units/index.js` + sprite in `modules/render/sprites.js` |
| New building          | `config.building` + (optional) `commands/build.js` + HUD button in `index.html` + sprite |
| New command type      | `src/commands/<name>.js` with `validate*`/`apply*`, register in `DEFS` in `commands/index.js` |
| AI behavior           | `modules/ai/decision-att.js` / `decision-def.js` — emit commands only, never mutate state |
| New AI personality    | `modules/ai/decision-<name>.js` + `DECIDERS` map in `ai/index.js` + `<option>` in `index.html` |
| Map / placement rules | `modules/map/index.js` (`isWalkable`, `canPlaceBuilding`)             |
| Pathfinding tweaks    | `modules/pathfinding/a-star.js`                                       |

## Conventions

- ES modules; `"type": "module"` in `package.json`. No bundler.
- Each module under `src/modules/*` exposes a single `index.js` with JSDoc typedefs at the top describing its public API. Internals are not imported across modules.
- Factory functions named `create*` take a `deps` object (Dependency Injection). No singletons, no top-level mutable state.
- Cross-module entity refs are **numeric IDs**, resolved at read-time via `entities.byId(...)`.
- Sim modules (everything reachable from `sim/index.js`) are DOM-free and serializable.

## Known issues

- `tests/smoke-world.test.js` asserts `createWorld()` returns keys including `input` and `render`, but `core/world.js` does not wire those (they live in `client/bootstrap.js`). The test is stale; do not "fix" it without confirming whether the test or the structural contract should win.
