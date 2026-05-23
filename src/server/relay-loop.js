// Per-tick relay loop. Drains the relay queue, broadcasts the batch to both
// peers, then advances the server's own sim. On gameOver, invokes the
// onGameOver callback (which terminates the match in the orchestrator).
//
// The active sim is supplied via `getSim()` so the orchestrator can swap the
// instance on match start/end without the loop needing to know.

import { submitCommand, stepTick, TICK_DT } from '../sim/index.js';

/**
 * @param {{
 *   relay:        { collectTick:(t:number)=>Object[] },
 *   broadcast:    (msg:Object) => void,
 *   getSim:       () => Object|null,
 *   isActive:     () => boolean,
 *   onGameOver:   (winner:string) => void,
 * }} deps
 * @returns {{ start:() => void, stop:() => void, currentTick:() => number }}
 */
export function createRelayLoop({ relay, broadcast, getSim, isActive, onGameOver }) {
  let serverTick = 0;
  let handle = null;

  function tick() {
    if (!isActive()) return;
    const sim = getSim();
    if (!sim) return;

    // 1. Collect everything that accumulated since the last tick.
    const batch = relay.collectTick(serverTick);

    // 2. Broadcast to both peers. Empty batches still drive tick-advance.
    broadcast({ type: 'tick-commands', tick: serverTick, commands: batch });

    // 3. Apply the batch on the server's own sim, then advance.
    for (const cmd of batch) submitCommand(sim, cmd);
    stepTick(sim, TICK_DT);

    // 4. Match-end on victory.
    if (sim.state.gameOver) {
      onGameOver(sim.state.gameOver);
      return;
    }

    serverTick += 1;
  }

  return {
    start() {
      if (handle) return;
      handle = setInterval(tick, TICK_DT * 1000);
    },
    stop() {
      if (!handle) return;
      clearInterval(handle);
      handle = null;
    },
    /** Reset the per-match tick counter (called on match start/end). */
    reset() { serverTick = 0; },
    currentTick() { return serverTick; },
  };
}
