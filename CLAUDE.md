# Project guidance for Claude

## Project analysis scripts

Lightweight CLIs in `.claude/scripts/` that *complement* `Read`/`Grep`. Each one answers a single class of question and emits flat one-line-per-match output (greppable, pipeable, token-tight). They beat `Grep` only when the question is about **code structure** — declarations, references, call graphs, mutations — not for literal-string lookups.

### When to reach for which

- **Reading a known file** → `Read`. Don't run a script.
- **Single literal string** → `Grep`. Don't run a script.
- **First contact with a directory** → `node .claude/scripts/map.mjs <dir>`. One line per file: `path | LOC | exports`. ~150 tokens for a 6-file module.
- **"Where is `X` defined / referenced / called?"** → `ast.mjs defs|refs|calls|callees X`. Beats `Grep` when the same name appears in strings/comments or you need the enclosing-function context.
- **"How does code flow from `A` to `B`?"** → `ast.mjs trace A --depth N` or `ast.mjs path A B`. No `Read`/`Grep` equivalent.
- **"Where does `state.foo.bar` get mutated?"** → `ast.mjs writes 'state.foo.*'`. Powers single-writer audits at a fraction of the cost.
- **"Show me just one function from a 500-LOC file"** → `ast.mjs slice fn <name>`. ~10× cheaper than reading the whole file.
- **Import graph** → `graph.mjs in|out|cycles|hubs|orphans`.
- **Git churn / npm deps / Claude Code token cost** → `git-activity.mjs`, `deps.mjs`, `tokens.mjs`.

See [.claude/scripts/README.md](.claude/scripts/README.md) for flags (`--scope`, `--depth`, `--context`, `--json`, `--quiet`) and full subcommand lists.

### When NOT to use them

- Reading a known file → `Read`.
- One-off literal-string lookup → `Grep`.
- Questions about runtime behavior → these are static analysis; run the code or read it.

### A note on the prior toolkit

The older heavy analyzers (`context.mjs` aggregator, recipes, per-analyzer markdown bundles) live under `.claude/scripts/_legacy/` and are no longer in use. Empirical testing showed they cost more tokens than they saved. The replacement toolkit above is the active one.

## Project stack

- Pure ESM vanilla JS (`"type": "module"` in package.json)
- Static-served via `npx serve .` (client-only — no Node backend)
- Tests: vitest (`npm test`)
- Source: `src/`, tests: `tests/`

## Architectural principles

Ten principles structure the codebase. **P1–P4** are foundational philosophy
that shapes how files and modules are organized — no CI check, they live in
the reader's head. **P5–P10** are mechanically enforced by `npm run check`.

### Base principles (P1–P4)

- **P1 — Separation of human-readable and machine-generated code.** The codebase splits into two layers. A *human-readable* layer (high-level declarative configs, interfaces, architectural skeleton) lets humans and AI orchestrators grasp system intent at minimal token cost. A *machine-generated* layer (verbose algorithms, parsers, heavy math) is rarely inspected by humans and is delegated to specialized agents.
- **P2 — Complex implementation, simple interface.** Inside the machine layer, code may be as verbose or hyper-optimized as needed, but it must expose a concise, intuitive high-level interface. External callers stay completely unaware of the underlying mechanics; complexity is strictly encapsulated.
- **P3 — Strict modularity.** Module boundaries are rigid and isolated. An agent tasked with editing one function or shader must be able to operate on a single file without dragging in cascading dependencies — so context for one feature never balloons to half the project.
- **P4 — Token-context optimization.** The repo is architected around LLM context-window constraints and cost. Pick the cheapest tool that answers the question. `Read` a known file; `Grep` a literal string; reach for `map.mjs` / `ast.mjs` / `graph.mjs` when the question is about *code structure* (declarations, references, call graphs, state mutations, import edges) — things `Grep` can't answer cleanly. Avoid monolithic context bundles: empirically they cost more than they save.

### Enforced principles (P5–P10)

| # | Principle | Enforced by |
|---|---|---|
| **P5** | **Explicit internals.** Files named `*.internal.js` may only be imported from the same directory. | `.claude/scripts/check-internals.mjs` |
| **P6** | **Public-surface contract.** Each module's exported names + factory output keys are snapshotted; changes show up as snapshot diffs. | `tests/public-surfaces.test.js` |
| **P7** | **Single-writer rule.** Sim state (the top-level fields of `GameState`) may be mutated only from `src/commands/`, `src/core/`, and the tick-phase modules (units/combat/entities/ai/replay). | `.claude/scripts/check-single-writer.mjs` |
| **P8** | **Determinism guard.** No `Math.random` / `Date.now` / `performance.now` / `new Date(...)` in the sim path. The sim must be a pure function of inputs. | `.claude/scripts/check-determinism.mjs` |
| **P9** | **Phase order as data.** Tick phases are an exported ordered list in `src/core/game-loop.js` — adding or reordering phases requires editing the list. | `tests/phase-order.test.js` |
| **P10** | **Task-templated skills.** Common modifications (`add-command`, `modify-unit`, `tune-ai`, `add-render-layer`) have prose skill briefs naming the exact files to touch and the CI invariants to respect. | `.claude/skills/` |

Run `npm run check` to validate everything. Individual checks: `npm run check:internals`, `check:single-writer`, `check:determinism`. Followup work (deferred from the principles landing) is captured in `todo.md` at the repo root.
