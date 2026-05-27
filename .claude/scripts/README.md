# Analysis scripts for Claude

Lightweight, single-purpose CLIs that *complement* `Read`/`Grep` for project exploration. Each one answers one class of question and emits flat one-line-per-match output (greppable, pipeable, token-tight).

## Common conventions

- ESM, run with `node .claude/scripts/<name>.mjs <subcommand?> [args] [--flags]`
- stdout = results only, one match per line. stderr = a single summary line (suppress with `--quiet`).
- `--json` opt-in for JSON Lines output.
- All scripts ignore `node_modules`, `.git`, `dist`, `build`, `coverage`, `.claude`, hidden dirs, and (in `ast.mjs`) `tests/` + `*.test.js`.
- All are pure read operations.

## When to reach for these scripts vs. Read/Grep

- `Read` a known file → fastest. Don't run anything.
- `Grep` for a literal string → fastest. Don't run anything.
- `map.mjs` — first contact with a directory (~150 tokens for a small module).
- `ast.mjs defs|refs|calls|callees` — symbol-aware lookup. Beats `Grep` when the same name appears in strings/comments or you need the call-graph context.
- `ast.mjs trace|path` — code flow / call graph. No `Read`/`Grep` equivalent.
- `ast.mjs writes <pattern>` — find every assignment to a state path (single-writer audits).
- `ast.mjs slice fn <name>` — pull just one function out of a long file; ~10× cheaper than reading the file.
- `graph.mjs in|out|cycles|hubs|orphans` — file-level import graph.
- `git-activity.mjs`, `deps.mjs`, `tokens.mjs` — git / npm / Claude Code analytics.

## Scripts

### Exploration

| Script | Purpose | Example |
|---|---|---|
| `map.mjs [target]` | One line per file: `path \| LOC \| exports` | `node .claude/scripts/map.mjs src/modules/units` |
| `ast.mjs <sub> <args>` | AST-powered symbol + flow queries (see below) | `node .claude/scripts/ast.mjs trace createUnits` |
| `graph.mjs <sub> [args]` | File-level import graph queries | `node .claude/scripts/graph.mjs in src/modules/combat/index.js` |

### `ast.mjs` subcommands

| Subcommand | Question |
|---|---|
| `defs <name>` | Where is `<name>` declared? |
| `refs <name>` | Where is `<name>` referenced (excludes declarations)? |
| `calls <name>` | Who calls `<name>` (and from what enclosing fn)? |
| `callees <name>` | What does `<name>` call? |
| `trace <name>` | Recursive call tree from `<name>` (`--depth N`). |
| `path <from> <to>` | Call paths from `<from>` to `<to>` (`--depth N`). |
| `writes <pattern>` | Assignments to a state path glob, e.g. `state.units.*`. |
| `slice fn <name>` | Print just `<name>`'s source. |
| `slice imports <file>` | Print just the import statements of `<file>`. |
| `slice exports <file>` | Print just the export statements of `<file>`. |

Common flags: `--scope <dir>` (default `src`), `--ignore <glob>`, `--depth N`, `--context N`, `--json`, `--quiet`.

### `graph.mjs` subcommands

| Subcommand | Output |
|---|---|
| `in <file>` | files imported by `<file>` |
| `out <file>` | files that import `<file>` |
| `cycles [scope]` | one cycle per line |
| `hubs [N] [scope]` | top-N most-imported files |
| `orphans [scope]` | files nothing imports |

### Analytics / git / npm

| Script | Purpose |
|---|---|
| `deps.mjs` | npm deps usage analysis (used / unused / missing). |
| `git-activity.mjs` | Recent commits, hot files, directory churn, authors. |
| `tokens.mjs` | Claude Code per-session token usage + cost estimates (reads `~/.claude/projects/<key>/`). |

### CI guards (not exploration tools)

`check-internals.mjs`, `check-single-writer.mjs`, `check-determinism.mjs`, `check-faction-access.mjs`, `check-snapshot-ack.mjs`, `precommit.mjs`. Invoked via `npm run check`.

### Replay

`replay.mjs`, `_replay-report.mjs` — replay analysis (separate concern).

## Caveats

- **Scope-naive matching.** `ast.mjs refs|calls` matches by identifier name, not lexical scope. The same name in two scopes is reported in both. Disambiguate with `--context 1` or by inspecting the line. (Adding a scope tracker is a fast follow-up if false positives bite.)
- **Top-level declarations only.** `ast.mjs` indexes top-level functions/classes/consts. Nested functions are not indexed; trace from the outer function instead.
- **No source caching.** Each run re-parses every file in scope (~100 ms for the whole `src/`). Fast enough that caching would cost more than it saves.

## Dependencies

`acorn` (devDependency). All other behavior uses Node built-ins.

## Legacy

Older heavy analyzers and recipes live under [`_legacy/`](_legacy/README.md) for git-history reference and are no longer in use. See that folder's README for the replacement mapping.
