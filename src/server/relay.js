// PUBLIC API of the lockstep command relay.
// Pure, DI-free, sim-free — easily unit-testable.
//
// Responsibilities:
//   - Assign monotonic per-player `seq` numbers (mirrors the dispatcher's pattern).
//   - Buffer commands across the inter-tick gap.
//   - On collectTick(serverTick), stamp `tick`, sort deterministically by
//     (playerId, seq), drain, and return the batch the server should broadcast.
//
// The seq pattern intentionally matches createCommands.seqByPlayer in
// src/commands/index.js so that semantics are identical end-to-end.

/**
 * @typedef {import('../commands/index.js').Command} Command
 *
 * @typedef {Object} RelayModule
 * @property {(playerId:string) => number} stampSeq
 *   Allocate the next seq for this player. Does not buffer the command — caller
 *   sets cmd.seq itself, then calls enqueue.
 * @property {(cmd:Command) => void} enqueue
 *   Buffer a (server-stamped) command for the next collectTick.
 * @property {(serverTick:number) => Command[]} collectTick
 *   Stamp `tick`, sort by (playerId, seq), return the batch. Empties the buffer.
 * @property {() => number} pendingCount
 * @property {() => void} reset
 *   Clear seq counters and buffer (used on restart).
 */

/** @returns {RelayModule} */
export function createRelay() {
  /** @type {Command[]} */
  let queue = [];
  /** @type {Map<string,number>} */
  const seqByPlayer = new Map();

  function stampSeq(playerId) {
    const n = (seqByPlayer.get(playerId) || 0) + 1;
    seqByPlayer.set(playerId, n);
    return n;
  }

  function enqueue(cmd) {
    queue.push(cmd);
  }

  function collectTick(serverTick) {
    if (queue.length === 0) return [];
    for (const cmd of queue) {
      if (cmd.tick == null) cmd.tick = serverTick;
    }
    queue.sort((a, b) => {
      if (a.playerId !== b.playerId) return a.playerId < b.playerId ? -1 : 1;
      return a.seq - b.seq;
    });
    const out = queue;
    queue = [];
    return out;
  }

  function pendingCount() { return queue.length; }

  function reset() {
    queue = [];
    seqByPlayer.clear();
  }

  return { stampSeq, enqueue, collectTick, pendingCount, reset };
}
