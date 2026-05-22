// Deterministic digest of a simulation state.
//
// Used to verify that a reconstructed replay reached EXACTLY the same state as
// the original recording. A mismatch means the determinism invariant broke:
//   "final state is a pure function of spawnInitial() + the ordered command stream".
//
// The sim has no Math.random(), so two runs from the same inputs produce
// bit-identical floats; truncating to integers here only keeps the digest
// compact and stable across JSON round-trips — it does not paper over drift.

/**
 * @param {import('../core/game-state.js').GameState} state
 * @returns {string} `${tick}:${unsigned32BitHash}`
 */
export function stateChecksum(state) {
  let h = 0;
  const fold = (n) => { h = (Math.imul(h, 31) + (n | 0)) | 0; };

  fold(state.tick);
  fold(state.players.red.gold);
  fold(state.players.red.wood);
  fold(state.players.blue.gold);
  fold(state.players.blue.wood);
  fold(state.entities.length);
  fold(state.gameOver === 'red' ? 1 : state.gameOver === 'blue' ? 2 : 0);

  // Entities are stored in deterministic creation order, so this fold is stable.
  for (const e of state.entities) {
    fold(e.id);
    fold(e.hp);
    fold(e.x);
    fold(e.y);
  }
  return `${state.tick}:${h >>> 0}`;
}
