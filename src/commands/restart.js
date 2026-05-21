// 'restart' command: tear down and respawn the standard match.
//
// Shape:
//   { type:'restart', playerId, tick, seq }
//
// Validation is intentionally permissive — any connected player may restart. The
// server is free to add authority checks (host-only, end-of-game-only) on top.
//
// applyRestart calls entities.spawnInitial(), which resets state.tick / gameOver /
// players / entity list in place. The dispatcher does NOT call ai.resetAI(); AI
// throttle counters are module-local and at worst introduce a small post-restart
// delay before the first AI decision — acceptable for MVP.
//
// Determinism: spawnInitial is deterministic (no Math.random anywhere in the sim),
// so every peer reaches the same post-restart state.

export function validateRestart(deps, cmd) {
  if (cmd.playerId !== 'red' && cmd.playerId !== 'blue') {
    return { ok: false, reason: 'bad player' };
  }
  return { ok: true };
}

export function applyRestart(deps) {
  deps.entities.spawnInitial();
}
