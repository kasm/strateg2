# Project guidance for Claude

## Project analysis scripts

Before doing structural exploration of this codebase with `Glob`/`Grep`, **check if one of the prebuilt analyzers fits**. They live in `.claude/scripts/` and produce LLM-friendly markdown — cheaper, more accurate, and reproducible than ad-hoc search.

### When to use

- **Starting fresh on this repo** → run `node .claude/scripts/context.mjs` and read `.claude/context/project.md`. That single file replaces 10+ exploratory Glob/Grep calls.
- **Drilling into a module** → run `node .claude/scripts/context.mjs <relative/path>` and read the resulting `.claude/context/<safe>.md`.
- **Specific structural questions** — use the targeted scripts below instead of grepping yourself.

### Available scripts

| Need | Script |
|---|---|
| Directory tree, entry points, JS LOC | `node .claude/scripts/structure.mjs [target]` |
| Who imports what (file graph + cycles) | `node .claude/scripts/graph.mjs [target]` |
| Exported symbols per file | `node .claude/scripts/symbols.mjs [target]` |
| Find references to a symbol | `node .claude/scripts/refs.mjs <name> [target]` |
| Server routes / socket events | `node .claude/scripts/routes.mjs [target]` |
| Classify files as client/server/shared | `node .claude/scripts/client-server.mjs [target]` |
| Event handlers (DOM, sockets, EE) | `node .claude/scripts/events.mjs [target]` |
| Static assets inventory + refs | `node .claude/scripts/assets.mjs [target]` |
| Complexity hotspots | `node .claude/scripts/complexity.mjs [target]` |
| TODO/FIXME/HACK markers | `node .claude/scripts/todos.mjs [target]` |
| Git churn / hot files / authors | `node .claude/scripts/git-activity.mjs [target]` |
| npm deps usage analysis | `node .claude/scripts/deps.mjs` |
| Aggregator (writes consolidated markdown) | `node .claude/scripts/context.mjs [target]` |

All scripts are pure read operations — safe to run without confirmation. See `.claude/scripts/README.md` for details, flags, and conventions.

### When NOT to use them

- Editing code → use `Edit`/`Write`.
- Reading a known file → use `Read` directly.
- One-off lookup of a single string → `Grep` is faster than spinning up a script.
- Questions about runtime behavior → these scripts are static analysis; run the code or read it.

### Hint for plan execution

When implementing a multi-step plan, generating `.claude/context/<target>.md` once at the start of each step keeps subsequent context-gathering deterministic and cheap, instead of re-scanning the tree every session.

## Project stack

- Pure ESM vanilla JS (`"type": "module"` in package.json)
- Static-served via `npx serve .` (client-only — no Node backend)
- Tests: vitest (`npm test`)
- Source: `src/`, tests: `tests/`
