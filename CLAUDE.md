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
| **Task-templated context bundle** (P10) | `node .claude/scripts/recipes/<name>.mjs` |

Recipes are curated bundles for common modification tasks. They emit
`.claude/context/recipe-<name>.md` with a task brief (read order, constraints,
CI-enforced rules) plus the full context for the relevant files. Use these
instead of guessing what to read.

| Recipe | Use when |
|---|---|
| `modify-unit` | Adding or tweaking unit combat, logistics, movement |
| `add-command` | Introducing a new command type into the dispatcher |
| `tune-ai` | Adjusting AI deciders (att/def/adaptive/utility/hybrid) |
| `add-render-layer` | Adding or modifying a render layer / HUD overlay |

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

## Architectural principles (CI-enforced)

The codebase is organized around four base principles (separation of human-curated
orchestration vs machine-territory leaves, complex implementation behind simple
interface, strict modularity, token-context optimization). Six additional principles
are enforced by `npm run check`:

| # | Principle | Enforced by |
|---|---|---|
| **P5** | **Explicit internals.** Files named `*.internal.js` may only be imported from the same directory. | `.claude/scripts/check-internals.mjs` |
| **P6** | **Public-surface contract.** Each module's exported names + factory output keys are snapshotted; changes show up as snapshot diffs. | `tests/public-surfaces.test.js` |
| **P7** | **Single-writer rule.** Sim state (the top-level fields of `GameState`) may be mutated only from `src/commands/`, `src/core/`, and the tick-phase modules (units/combat/entities/ai/replay). | `.claude/scripts/check-single-writer.mjs` |
| **P8** | **Determinism guard.** No `Math.random` / `Date.now` / `performance.now` / `new Date(...)` in the sim path. The sim must be a pure function of inputs. | `.claude/scripts/check-determinism.mjs` |
| **P9** | **Phase order as data.** Tick phases are an exported ordered list in `src/core/game-loop.js` — adding or reordering phases requires editing the list. | `tests/phase-order.test.js` |
| **P10** | **Task-templated context bundles.** Common modifications have named recipes that emit precisely the files an agent needs. | `.claude/scripts/recipes/` |

Run `npm run check` to validate everything. Individual checks: `npm run check:internals`, `check:single-writer`, `check:determinism`. Followup work (deferred from the principles landing) is captured in `todo.md` at the repo root.
