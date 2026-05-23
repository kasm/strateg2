# TODO — followup work after the principles landing

The six architectural principles (P5–P10) and their CI checks are in place. These
items were deliberately out of scope for that PR but were noted during exploration
or implementation. Each is independently shippable.

## Modularity violations surfaced by P5/P6

### 1. `units/` rename to `*.internal.js` (blocked on leak fixes below)

The other three subsystems (`commands/`, `combat/`, `ai/`) had their internals
renamed to `*.internal.js`. `units/` was skipped because three files outside
`units/` reach into its internals:

- `src/commands/eject.internal.js:6` imports `ejectAllFromTower` from `../modules/units/archer.js`
- `src/modules/entities/index.js:9` imports `ejectAllFromTower` from `../units/archer.js`
- `src/modules/ai/common.internal.js:4` imports `findNearestResourceTile` from `../units/logistics.js`

**Fix path**:
- Promote `ejectAllFromTower` and `findNearestResourceTile` to `units/index.js`'s
  public surface (re-export from there).
- Update the three importers to go through `units/index.js`.
- Then rename `archer.js`, `logistics.js`, `movement.js`, `peasant.js`, `melee.js`
  to `*.internal.js`.
- `npm run check` will go from passing to passing — both before and after — but
  the principle's coverage will increase from 3 to 4 subsystems.

### 2. `entities → archer` abstraction leak

`src/modules/entities/index.js:9` imports `ejectAllFromTower` from `../units/archer.js`.
This is the cleanest single violation in the codebase: entities (a peer module)
reaches into units' internals.

**Fix options** (decide during the units/ rename above):
- (a) Move `ejectAllFromTower` into `entities/` since entities owns the tower's
  `garrisonIds` array anyway. Cleaner ownership.
- (b) Make tower-eject a command (`{type:'eject', targetId}`). Then `killEntity`
  submits the command instead of calling the helper directly. Heavier but more
  uniform with the command-routed mutation pattern.

(a) is the lighter move. (b) is the more architecturally consistent move.

### 3. `commands/eject` leak (same root cause as above)

`src/commands/eject.internal.js:6` also imports from `units/archer.js`. Same fix:
go through the resolved units/ public API.

## Orchestrator drift

These files are doing more than thin wiring. None are urgent — none break the
principles — but each is a candidate to split in a focused refactor PR.

### 4. `src/client/bootstrap.js` (271 LOC)

MP/SP mode branching, lobby/transport selection, spawn-initial dance, and the RAF
loop all live in one file. Extract a `client/game-controller.js` that owns the
mode switch and initial spawn; keep `bootstrap.js` to RAF + DOM + composition only.

### 5. `src/server/index.js` (341 LOC)

Static-serve, matchmaking, and the per-tick relay/broadcast loop all in one place.
Extract `server/relay-loop.js` for the tick relay; the orchestrator should just
compose the three subsystems.

### 6. `src/modules/input/index.js` (221 LOC)

Wires mouse + keyboard + drag-rect + ~6 UI refresh functions. Lower priority than
4 and 5 — the file is doing a lot but each piece is small.

## Sim discipline

### 7. AI migration through `commands.submit()`

`src/commands/index.js:13` already documents the plan:
> _"AI still mutates directly inline; phase 4 will route it through here too."_

The P7 single-writer check has `src/modules/ai/` in its allowlist as a tracked
carve-out. Once AI is fully command-routed, drop that prefix from
`.claude/scripts/check-single-writer.mjs:ALLOWED_PREFIXES`. The check will then
catch any regression that mutates sim state from AI.

## Optional infrastructure

### 8. `.github/workflows/check.yml`

The plan left this optional. `npm run check` works locally. When the repo gets a
CI provider, add a workflow that runs `npm ci && npm run check` on push and PR.
