# Legacy analyzers (deprecated)

These scripts are preserved for git history and reference. They are no longer in active use and are not invoked by any project tooling.

They were replaced because empirical testing showed they cost more tokens than they saved: monolithic markdown bundles, markdown-table chrome, and metadata that didn't replace reading source. See the plan at `~/.claude/plans/i-made-a-few-humming-shamir.md`.

## Replacements

| Legacy script | Replaced by |
|---|---|
| `context.mjs` (and the `recipes/` wrappers) | nothing — use targeted tools instead |
| `structure.mjs`, `symbols.mjs`, `complexity.mjs` | `../map.mjs` |
| `refs.mjs` | `../ast.mjs refs <name>` / `ast.mjs calls <name>` |
| `events.mjs`, `routes.mjs`, `client-server.mjs`, `assets.mjs`, `todos.mjs` | `Grep` directly |
| `recipes/*.mjs` | the prose briefs already live in `.claude/skills/` |

The new active toolkit lives one directory up: `ast.mjs`, `map.mjs`, `graph.mjs`. See [../README.md](../README.md).
