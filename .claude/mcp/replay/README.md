# replay MCP server

Analyze, verify, and diff strateg2 replay JSON files. Composes the shared
`_replay-report.mjs` helper (also used by the `.claude/scripts/replay.mjs`
CLI) — output of `replay.analyze` is byte-identical to the CLI, enforced by
`tests/mcp-replay.test.js`.

## Registration

In `.mcp.json`:

```json
{
  "mcpServers": {
    "replay": { "command": "node", "args": [".claude/mcp/replay/server.mjs"] }
  }
}
```

## Tools

| Tool | Inputs | Output |
|---|---|---|
| `replay.analyze` | `{ path, every?: 300 }` | markdown report (same format as `.claude/scripts/replay.mjs`) |
| `replay.verify`  | `{ path }` | `{ verified, finalTick, winner, checksum }` |
| `replay.diff`    | `{ a, b }` | `{ identical, finalTickA, finalTickB, winnerA, winnerB, firstChecksumDivergenceTick, firstCommandDivergenceTick, commandsByTickDiff }` |

## Safety

- **Read-only.** Handlers only read replay JSON; no disk writes.
- **Path validation.** All path inputs must end in `.json` and resolve under
  the repo root. Absolute paths and `..` traversal are rejected.
