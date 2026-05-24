# analyzers MCP server

Wraps the read-only static-analysis scripts in `.claude/scripts/` as typed MCP
tools. Lets agents get structured analysis output without shelling out per
call.

## Registration

In `.mcp.json`:

```json
{
  "mcpServers": {
    "analyzers": { "command": "node", "args": [".claude/mcp/analyzers/server.mjs"] }
  }
}
```

## Selftest

```sh
node .claude/mcp/analyzers/server.mjs --selftest
```

## Tools

Each tool spawns its corresponding `.claude/scripts/<name>.mjs` and returns
the stdout markdown verbatim.

| Tool | Script | Args |
|---|---|---|
| `analyze.structure`   | `structure.mjs`   | `{ target? }` |
| `analyze.graph`       | `graph.mjs`       | `{ target? }` |
| `analyze.symbols`     | `symbols.mjs`     | `{ target? }` |
| `analyze.refs`        | `refs.mjs`        | `{ name, target? }` |
| `analyze.routes`      | `routes.mjs`      | `{ target? }` |
| `analyze.complexity`  | `complexity.mjs`  | `{ target? }` |
| `analyze.deps`        | `deps.mjs`        | `{}` |
| `analyze.todos`       | `todos.mjs`       | `{ target? }` |
| `analyze.gitActivity` | `git-activity.mjs`| `{ target? }` |
| `analyze.context`     | `context.mjs`     | `{ target? }` |

## Safety

- **Read-only by construction.** No handler writes to disk.
- **No shell.** Scripts are spawned directly via `child_process.spawnSync`
  with `shell: false` (default).
- **Strict arg validation.** `target` must be repo-relative, no `..`,
  characters limited to `[A-Za-z0-9_./-]`. `name` (for `refs`) must be a JS
  identifier `[A-Za-z_][A-Za-z0-9_]*`. Injection is impossible.
