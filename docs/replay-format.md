# Strateg2 replay format

A **replay** is a single JSON file that records one match as the ordered stream
of commands that produced it. The simulation is fully deterministic — no
`Math.random()`, fixed 30 Hz timestep, hardcoded `spawnInitial()` seed — so the
command stream is enough to reconstruct every tick of the game exactly. No game
state is stored; it is all re-derived by re-simulating.

This makes replays tiny (commands fire only on a click or an AI decision),
human-readable, and an open format any tool or AI can consume.

## File shape

```json
{
  "format": "strateg2-replay",
  "version": 1,
  "engine": { "tickRate": 30 },
  "recordedAt": "2026-05-22T12:00:00.000Z",
  "setup": {
    "alwaysHit": true,
    "supplyPriority": "auto",
    "aiType": { "red": "hybrid", "blue": "def" }
  },
  "result": { "winner": "red", "finalTick": 5421 },
  "checksum": "5421:2741839201",
  "commands": [
    { "type": "build", "playerId": "red", "tick": 0,  "seq": 1,
      "kind": "barracks", "tileX": 5, "tileY": 9 },
    { "type": "train", "playerId": "blue", "tick": 45, "seq": 1,
      "buildingId": 7, "unitKind": "archer" }
  ]
}
```

### Top-level fields

| Field | Meaning |
|---|---|
| `format` | Always `"strateg2-replay"`. Reject files that differ. |
| `version` | Format version (currently `1`). |
| `engine.tickRate` | Sim ticks per second (`30`). `finalTick / tickRate` = match length in seconds. |
| `recordedAt` | ISO timestamp when the match started. |
| `setup` | Sim-affecting state at tick 0 — must be restored before replay. |
| `result.winner` | `"red"`, `"blue"`, or `null` if the file is a partial (in-progress) save. |
| `result.finalTick` | Last tick of the match; reconstruction stops here. |
| `checksum` | `"<tick>:<hash>"` digest of the final state, for determinism verification. |
| `commands` | The ordered command log — see below. |

### `setup`

- `alwaysHit` — arrow-homing toggle; changes combat. Restore before tick 0.
- `supplyPriority` — `"auto" \| "wood" \| "arrows"`; changes peasant logistics.
- `aiType` — `{ red, blue }`, each `off|att|def|adaptive|utility|hybrid`. This
  is **metadata only**: replays run with AI off (the log already contains every
  command the AI produced). Useful for labelling and analysis.

Mid-match changes to `alwaysHit` / `supplyPriority` are captured as `setOption`
commands, so the values above are only the *initial* ones.

### `commands`

Each entry is a `Command` (see `src/commands/index.js`). Common fields:

- `type` — `order | build | train | eject | restart | setOption`
  (`restart` never appears in a replay — it starts a *new* recording).
- `playerId` — `"red"` or `"blue"`.
- `tick` — the tick the command was drained/applied at.
- `seq` — monotonic per-player counter; commands within a tick apply in
  `(playerId, seq)` order.

Type-specific fields:

| `type` | extra fields |
|---|---|
| `order` | `unitIds: number[]`, `target: {kind:'tile',x,y} \| {kind:'entity',id}` |
| `build` | `kind`, `tileX`, `tileY` |
| `train` | `buildingId`, `unitKind` |
| `eject` | `buildingId` |
| `setOption` | `key` (`alwaysHit`\|`supplyPriority`), `value` |

Only commands that passed validation and were applied are recorded.

## Reconstruction

`reconstructReplay(replay, { onTick })` in `src/replay/reconstruct.js`:

1. `createSimWorld(CONFIG)` → `spawnInitial()` (the fixed seed).
2. Restore `setup.alwaysHit` / `setup.supplyPriority`; force `aiType` off.
3. For each tick `T` from `0` to `result.finalTick`: submit every command with
   `tick === T`, then `stepTick()`.
4. Recompute the checksum and compare to `replay.checksum`.

A checksum mismatch means the determinism invariant broke — *sim state is a
pure function of `spawnInitial()` plus the ordered command stream* — and points
at a regression (a stray `Math.random()`, an un-commanded state write, etc.).

## Producing and consuming replays

- **Record** — automatic. Every match is recorded by `world.recorder`
  (`src/replay/recorder.js`); a new recording starts on `spawnInitial` / restart.
- **Save** — the *Download replay* button on the game-over overlay writes the
  JSON file.
- **Analyse** — `node .claude/scripts/replay.mjs <file.json>` reconstructs the
  match and prints a keyframe timeline + semantic event list for AI analysis.
