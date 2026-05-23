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
import { stateChecksum } from './checksum.js';

export const REPLAY_FORMAT = 'strateg2-replay';
export const REPLAY_VERSION = 1;

/**
 * @typedef {Object} Recorder
 * @property {(state:Object) => void} begin
 * @property {(cmd:Object) => void} record
 * @property {(state:Object) => void} finish
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
  let frozen = null; // { result, checksum } captured at gameOver

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

  /**
   * Build the replay JSON. For a finished match the frozen result/checksum are
   * used; for an in-progress download a best-effort snapshot of `state` is taken.
   */
  function toReplay(state) {
    const result = finished
      ? frozen.result
      : { winner: state.gameOver, finalTick: state.tick };
    const checksum = finished ? frozen.checksum : stateChecksum(state);
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      engine: { tickRate: Math.round(1 / TICK_DT) },
      recordedAt,
      // aiType reflects the AIs in effect for the match (metadata only —
      // replays run with AI off, the command log is the sole input).
      setup: { ...setup, aiType: { red: state.aiType.red, blue: state.aiType.blue } },
      result,
      checksum,
      commands: commands.slice(),
    };
  }

  return {
    begin,
    record,
    finish,
    toReplay,
    get commandCount() { return commands.length; },
    get isFinished() { return finished; },
  };
}
