// Replay recorder — captures a match as the ordered stream of commands that
// produced it. The sim is fully deterministic, so the command stream plus the
// fixed spawnInitial() seed is enough to reconstruct every tick exactly.
//
// Lifecycle:
//   begin(state)   — a fresh match started (spawnInitial / restart). Snapshot
//                    the reconstruction-critical setup, clear the command log.
//   record(cmd)    — called by the command dispatcher for every APPLIED command.
//   finish(state)  — gameOver fired. Freeze result + checksum so post-gameOver
//                    player fiddling never pollutes the replay.
//   toReplay(state)— assemble the JSON replay object (see docs/replay-format.md).
//
// The recorder lives on the sim world (world.recorder) and is always on:
// recording is one cheap array push per command, and commands are infrequent.

import { TICK_DT } from '../core/game-loop.js';
import { isPlayer, players, get } from '../core/factions.js';
import { stateChecksum } from './checksum.js';

export const REPLAY_FORMAT = 'strateg2-replay';
export const REPLAY_VERSION = 1;

// Human-readable AI names, mirroring AI_OPTIONS in src/client/bootstrap.js.
// Duplicated (not imported) so the recorder stays free of client dependencies
// and the replay JSON's status string is self-contained.
const AI_LABELS = {
  off:      'Manual',
  att:      'Att AI',
  def:      'Def AI',
  adaptive: 'Adaptive AI',
  utility:  'Utility AI',
  hybrid:   'Hybrid AI',
};

/**
 * @typedef {Object} Recorder
 * @property {(state:Object) => void} begin
 * @property {(cmd:Object) => void} record
 * @property {(state:Object) => void} finish
 * @property {() => void} markTimeout
 * @property {(state:Object) => Object} toReplay
 * @property {number} commandCount
 * @property {boolean} isFinished
 */

/** @returns {Recorder} */
export function createRecorder() {
  let setup = null;
  let recordedAt = null;
  let commands = [];
  let finished = false;
  let frozen = null;   // { result, checksum } captured at gameOver
  let timedOut = false;

  /**
   * Snapshot the tick-0 reconstruction inputs and start a new log.
   * `alwaysHit` / `supplyPriority` are captured here because reconstruction must
   * restore them before tick 0. `mapW` / `mapH` are captured so a non-default
   * map size reconstructs to the same dims (createSimWorld is dim-parameterised).
   * `aiType` is NOT captured here — it is read at toReplay() time instead: the
   * HUD dropdowns are usually set just after spawnInitial, so the begin-time
   * value is still the default and would mislabel the replay.
   */
  function begin(state, mapW, mapH) {
    recordedAt = new Date().toISOString();
    setup = {
      alwaysHit: state.alwaysHit,
      supplyPriority: state.supplyPriority,
      mapW,
      mapH,
    };
    commands = [];
    finished = false;
    frozen = null;
    timedOut = false;
  }

  /** Append an applied command. Restarts begin a NEW replay, so they're skipped. */
  function record(cmd) {
    if (finished || cmd.type === 'restart') return;
    // Commands are guaranteed ref-free + JSON-safe by the dispatcher's contract;
    // clone so a later mutation of the live command can't rewrite history.
    commands.push(JSON.parse(JSON.stringify(cmd)));
  }

  /** Freeze the outcome the instant gameOver is set. Idempotent. */
  function finish(state) {
    if (finished) return;
    finished = true;
    frozen = {
      result: { winner: state.gameOver, finalTick: state.tick },
      checksum: stateChecksum(state),
    };
  }

  // Mark this match as force-stopped by the auto-battles harness (sim-time
  // budget exhausted). `finish(state)` should be called immediately after
  // with state.gameOver still null — toReplay() then emits status:"timeout"
  // alongside result.winner:null. Idempotent and a no-op after a natural finish.
  function markTimeout() {
    if (finished) return;
    timedOut = true;
  }

  /**
   * Build the replay JSON. For a finished match the frozen result/checksum are
   * used; for an in-progress download a best-effort snapshot of `state` is taken.
   */
  function toReplay(state) {
    const result = finished
      ? frozen.result
      : { winner: state.gameOver, finalTick: state.tick };
    const checksum = finished ? frozen.checksum : stateChecksum(state);
    const status = computeStatus(timedOut, result.winner, state.aiType);
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      engine: { tickRate: Math.round(1 / TICK_DT) },
      recordedAt,
      // aiType reflects the AIs in effect for the match (metadata only —
      // replays run with AI off, the command log is the sole input).
      setup: { ...setup, aiType: { red: state.aiType.red, blue: state.aiType.blue } },
      result,
      status,
      checksum,
      commands: commands.slice(),
    };
  }

  return {
    begin,
    record,
    finish,
    markTimeout,
    toReplay,
    get commandCount() { return commands.length; },
    get isFinished() { return finished; },
  };
}

// Human-readable summary of how the match ended. One of:
//   "timeout"                                      — harness force-stopped the match
//   "Red(Att AI) > Blue(Hybrid AI)"                — a player faction won
//   "draw"                                         — both eliminated on the same tick
//   null                                           — match still in progress
function computeStatus(timedOut, winner, aiType) {
  if (timedOut) return 'timeout';
  if (isPlayer(winner)) {
    const loser = players().find((p) => p !== winner);
    if (!loser) return null;
    const label = (k) => AI_LABELS[k] ?? k;
    return `${get(winner).label}(${label(aiType[winner])}) > ${get(loser).label}(${label(aiType[loser])})`;
  }
  if (winner === 'draw') return 'draw';
  return null;
}
