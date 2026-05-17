// ORCHESTRATOR: one simulation tick. Composes the module updates in their canonical order.
//   commands drained -> AI issues orders -> units act -> projectiles resolve
//   -> buildings produce -> dead cleared -> victory check.
// No business logic here — every step delegates into a module.
//
// Commands queued during the gap between ticks (player input, future network packets)
// are applied at the very start, in deterministic (playerId, seq) order. After that
// the rest of the tick is pure simulation against the post-command state.

export const TICK_DT = 1 / 30;

/**
 * Advance the simulation by one fixed timestep.
 * @param {import('./world.js').World} w
 * @param {number} dt
 */
export function tick(w, dt) {
  if (w.state.gameOver) return;
  w.commands.drain();
  w.state.tick += 1;
  w.ai.updateAI(dt);
  w.units.updateUnits(dt);
  w.combat.updateProjectiles(dt);
  w.combat.updateBuildings(dt);
  w.entities.pruneDead();
  checkVictory(w);
}

function checkVictory(w) {
  const red  = w.entities.buildingsOf('red').filter(b => b.kind !== 'goldMine');
  const blue = w.entities.buildingsOf('blue').filter(b => b.kind !== 'goldMine');
  if (red.length === 0)       w.state.gameOver = 'blue';
  else if (blue.length === 0) w.state.gameOver = 'red';
}
