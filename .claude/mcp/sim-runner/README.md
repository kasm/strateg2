# sim-runner MCP server

Exposes the strateg2 headless deterministic simulation as MCP tools. Lets an
agent spawn a world, submit commands, step ticks, and prove behavior via
byte-exact checksums — without spawning a browser or shelling out per call.

## Registration

In `.claude/settings.json`:

```json
{
  "mcpServers": {
    "sim-runner": { "command": "node", "args": [".claude/mcp/sim-runner/server.mjs"] }
  }
}
```

## Selftest

```sh
node .claude/mcp/sim-runner/server.mjs --selftest
```

Should print `OK sim-runner selftest — tick=…, checksum=…, entitiesCount=…`.

## Tool surface

| Tool | Effect |
|---|---|
| `sim.create` | Create a fresh world. Returns `worldId`. |
| `sim.spawnInitial` | Seed standard match (mines, town halls, peasants). |
| `sim.submit` | **The only mutation tool.** Submits a `Command` (see `src/commands/index.js`). |
| `sim.step` | Advance N ticks. |
| `sim.checksum` | Deterministic digest of state (uses `src/replay/checksum.js`). |
| `sim.snapshot` | Filtered read-only view of state fields. |
| `sim.dispose` | Release the world. |

## Safety / invariants

- **P7 single-writer.** `sim.submit` is the *only* tool that mutates state. It
  forwards to `submitCommand` (`src/sim/index.js`) which funnels into
  `commands.submit()` — the same path input, AI, and the future network layer
  use. No handler in `handlers.mjs` may write to `world.state.*` directly.
  Enforced by a greppable contract in `tests/mcp-sim-runner.test.js`.
- **P8 determinism.** Server uses no `Math.random`, `Date.now`,
  `performance.now`, or `new Date(...)`. World ids are allocated from a
  per-context counter. Replays of the same command sequence produce identical
  checksums.
- **In-memory only.** Worlds are stored in a per-process `Map`. No persistence,
  no filesystem writes. Restarting the server drops all worlds.
