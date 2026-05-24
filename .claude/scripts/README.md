# Analysis scripts for Claude

Read-only Node.js analyzers that produce LLM-friendly markdown summaries of this project's structure. Designed so Claude can call them instead of doing dozens of `Glob`/`Grep` calls — cheaper, more accurate, and reproducible.

## Common conventions

- All scripts: ESM, run with `node .claude/scripts/<name>.mjs`
- Output: markdown to stdout. Add `--out path/file.md` to write to a file.
- Most accept an optional positional `<target>` to scope analysis to a subdirectory or single file.
- All scripts ignore `node_modules`, `.git`, `dist`, `build`, `coverage`, `.cache`, `.next`, `.vite`, `.vitest-cache`, `.parcel-cache`, `.nyc_output`, `.idea`, `.vscode`, `.claude`, and hidden dirs.
- All scripts are pure read operations — safe to run anytime.

## Scripts

| Script | Purpose | Example |
|---|---|---|
| `structure.mjs` | Directory tree, file counts by extension, detected entry points, JS LOC | `node .claude/scripts/structure.mjs` |
| `deps.mjs` | npm deps from `package.json`, where each is imported, unused/missing flags | `node .claude/scripts/deps.mjs` |
| `graph.mjs` | File-to-file import graph (ESM + CJS), cycles, hubs, orphans | `node .claude/scripts/graph.mjs src/` |
| `symbols.mjs` | Exported symbols per file (functions, classes, consts, default, re-exports) | `node .claude/scripts/symbols.mjs src/modules/foo` |
| `refs.mjs <name>` | References to a symbol by name (regex; may have false positives) | `node .claude/scripts/refs.mjs aStarSearch` |
| `routes.mjs` | HTTP routes (express/koa/fastify/hapi) + socket.io events; says "not detected" for client-only | `node .claude/scripts/routes.mjs` |
| `client-server.mjs` | Classifies JS files as server / client / shared / mixed | `node .claude/scripts/client-server.mjs` |
| `events.mjs` | Event handlers: `addEventListener`, `.on`/`.emit`, inline `on*=`, EventEmitter | `node .claude/scripts/events.mjs` |
| `assets.mjs` | Static asset inventory (images, audio, 3D, fonts, shaders) + references | `node .claude/scripts/assets.mjs` |
| `complexity.mjs` | Per-file LOC, function/class count, max nesting depth, longest function | `node .claude/scripts/complexity.mjs --top 20` |
| `todos.mjs` | TODO/FIXME/HACK/XXX/NOTE markers | `node .claude/scripts/todos.mjs` |
| `git-activity.mjs` | Recent commits, hot files, directory churn, authors | `node .claude/scripts/git-activity.mjs --limit 100` |
| `context.mjs [target]` | Aggregator: runs the relevant subset, writes `.claude/context/<safe>.md` | `node .claude/scripts/context.mjs src/modules/pathfinding` |

## When to use which

- **First question about the project** → `context.mjs` (project-wide). Then read `.claude/context/project.md`.
- **Focused work on a directory/module** → `context.mjs <dir>` for a slice; then individual scripts to drill down.
- **"What is `X` and who uses it?"** → `symbols.mjs <dir>` to find definition, then `refs.mjs X` for usages.
- **"How do files connect?"** → `graph.mjs <dir>`.
- **"Is package `foo` actually used?"** → `deps.mjs`.
- **"What routes does the API expose?"** → `routes.mjs`. If empty, it's a client-only project.
- **Picking a refactor target / risky areas** → `complexity.mjs` for hotspots, `git-activity.mjs` for churn.

## Dependencies

`acorn` (declared in root `package.json` devDependencies). All other behavior uses Node built-ins.

## Output location

`context.mjs` writes to `.claude/context/<scope>.md`. That directory is gitignored — content is ephemeral and regenerable.

## Caveats

- `refs.mjs` uses regex, not LSP, so it can match identifiers in comments and unrelated scopes with the same name. For ground-truth references, use the editor's LSP.
- AST-based scripts use `acorn` with `sourceType: 'module'` (falls back to `'script'`). Syntax errors are reported in output rather than crashing the script.
- `_shared.mjs` is internal — don't invoke directly.
