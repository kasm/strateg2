// PUBLIC API of the commands module.
// The dispatcher is the SOLE writer to sim state outside per-tick simulation steps
// (movement, combat, projectiles, production, AI). Input + AI + future network all
// funnel through `submit()`; `drain()` validates and applies in deterministic order
// at the start of every tick.
//
// Hard rules (see plan: "Strict architectural seams"):
//   - No object refs in commands; entity refs are numeric IDs.
//   - Per-tick deterministic ordering: sort by (playerId, seq). Never arrival order.
//   - validate() is pure-read; apply() is the only mutation path.
//
// Phase 2/3/4 of the multiplayer refactor. AI is fully command-routed too; the only
// direct mutators left are the per-tick simulation steps inside tick(). The P7
// single-writer check (check-single-writer.mjs) enforces this — no carve-out for AI.

import { validateOrder, applyOrder } from './order.internal.js';
import { validateBuild, applyBuild } from './build.internal.js';
import { validateTrain, applyTrain } from './train.internal.js';
import { validateResearch, applyResearch } from './research.internal.js';
import { validateEject, applyEject } from './eject.internal.js';
import { validateRestart, applyRestart } from './restart.internal.js';
import { validateSetOption, applySetOption } from './set-option.internal.js';

/**
 * @typedef {Object} Command
 * @property {'order'|'build'|'train'|'research'|'eject'|'restart'|'setOption'} type
 * @property {string} playerId    - 'red' | 'blue' (or future bot id)
 * @property {number} [tick]      - filled by submit() if absent; tick the cmd applies at
 * @property {number} [seq]       - filled by submit() if absent; monotonic per-player counter
 *
 * @typedef {Object} CommandsModule
 * @property {(cmd:Command) => void} submit
 *   Append a command. The dispatcher fills in `seq` and `tick` if not set.
 *   Pre-stamped commands (from the network) are preserved verbatim.
 * @property {() => void} drain
 *   Sort the pending queue by (playerId, seq), then for each cmd run validate -> apply.
 *   Called once at the start of every tick.
 * @property {() => number} pendingCount
 */

const DEFS = {
  order:     { validate: validateOrder,     apply: applyOrder     },
  build:     { validate: validateBuild,     apply: applyBuild     },
  train:     { validate: validateTrain,     apply: applyTrain     },
  research:  { validate: validateResearch,  apply: applyResearch  },
  eject:     { validate: validateEject,     apply: applyEject     },
  restart:   { validate: validateRestart,   apply: applyRestart   },
  setOption: { validate: validateSetOption, apply: applySetOption },
};

/**
 * @param {{
 *   state:        import('../core/game-state.js').GameState,
 *   config:       import('../core/config.js').GameConfig,
 *   map:          import('../modules/map/index.js').MapModule,
 *   entities:     import('../modules/entities/index.js').EntitiesModule,
 *   units:        import('../modules/units/index.js').UnitsModule,
 *   pathfinding:  import('../modules/pathfinding/index.js').Pathfinding,
 *   recorder?:    import('../replay/recorder.js').Recorder,
 * }} deps
 * @returns {CommandsModule}
 */
export function createCommands(deps) {
  const queue = [];
  const seqByPlayer = new Map();

  function nextSeq(playerId) {
    const n = (seqByPlayer.get(playerId) || 0) + 1;
    seqByPlayer.set(playerId, n);
    return n;
  }

  function submit(cmd) {
    if (cmd.seq == null) cmd.seq = nextSeq(cmd.playerId);
    if (cmd.tick == null) cmd.tick = deps.state.tick;
    queue.push(cmd);
  }

  function drain() {
    if (queue.length === 0) return;
    // Deterministic ordering: per-player seq, then playerId tie-break. Never arrival order.
    queue.sort((a, b) => {
      if (a.playerId !== b.playerId) return a.playerId < b.playerId ? -1 : 1;
      return a.seq - b.seq;
    });
    for (const cmd of queue) {
      const def = DEFS[cmd.type];
      if (!def) continue;
      const v = def.validate(deps, cmd);
      if (!v.ok) continue;
      def.apply(deps, cmd);
      // Record only applied commands — invalid ones never touched state, and a
      // replay re-validates anyway. apply() runs first so a 'restart' has reset
      // the recorder before its own command would be (and is) skipped.
      deps.recorder?.record(cmd);
    }
    queue.length = 0;
  }

  return { submit, drain, pendingCount: () => queue.length };
}
