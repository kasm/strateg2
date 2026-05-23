// ORCHESTRATOR: one simulation tick. Composes the module updates in their canonical order.
//
// PHASES is the canonical, ordered list — the only source of truth for tick ordering.
// tick() iterates it. Adding a phase = adding an entry to PHASES. Reordering requires
// editing the list (and re-snapshotting tests/phase-order.test.js). No phase logic
// lives inline in tick() itself — only the gameOver early-return and the recorder
// finish bracket the phase loop.
//
// Commands queued during the gap between ticks (player input, future network packets)
// are applied at the very start, in deterministic (playerId, seq) order. After that
// the rest of the tick is pure simulation against the post-command state.

export const TICK_DT = 1 / 30;

/**
 * Tick phases, in canonical order.
 *
 * @phase drainCommands  Drain queued commands (validate + apply). Runs even on a
 *   gameOver tick so a 'restart' command can revive the world.
 * @phase advanceTick    Increment state.tick. Only runs on live (non-gameOver) ticks.
 * @phase aiUpdate       AI deciders run; orders mutate inline (legacy) or submit
 *   commands (preferred path; not yet fully enforced — see commands/index.js).
 * @phase unitsUpdate    Per-unit state machines step: gather, haul, move, attack.
 * @phase projectiles    In-flight projectiles advance; hits resolve damage.
 * @phase buildings      Production timers tick; trained units spawn at rally.
 * @phase pruneDead      Dead entities removed from state.entities and entitiesById.
 * @phase victoryCheck   If one side has no non-mine buildings, set state.gameOver.
 *
 * @type {Array<{name: string, fn: (w: import('./world.js').World, dt: number) => void}>}
 */
export const PHASES = [
  { name: 'drainCommands', fn: (w)     => w.commands.drain() },
  { name: 'advanceTick',   fn: (w)     => { w.state.tick += 1; } },
  { name: 'aiUpdate',      fn: (w, dt) => w.ai.updateAI(dt) },
  { name: 'unitsUpdate',   fn: (w, dt) => w.units.updateUnits(dt) },
  { name: 'projectiles',   fn: (w, dt) => w.combat.updateProjectiles(dt) },
  { name: 'buildings',     fn: (w, dt) => w.combat.updateBuildings(dt) },
  { name: 'pruneDead',     fn: (w)     => w.entities.pruneDead() },
  { name: 'victoryCheck',  fn: (w)     => checkVictory(w) },
];

/**
 * Advance the simulation by one fixed timestep.
 * @param {import('./world.js').World} w
 * @param {number} dt
 */
export function tick(w, dt) {
  // drainCommands always runs — a 'restart' on a gameOver tick must be processed.
  // spawnInitial inside apply('restart') clears state.gameOver and resets state.tick.
  // Stale orders from before the restart auto-fail validate() (entities no longer
  // exist) and are dropped.
  PHASES[0].fn(w, dt);
  if (w.state.gameOver) return;
  for (let i = 1; i < PHASES.length; i++) PHASES[i].fn(w, dt);
  // Freeze the replay the instant a side wins, so post-gameOver input (the overlay
  // is up but units are still clickable) never pollutes the recording.
  if (w.state.gameOver) w.recorder?.finish(w.state);
}

function checkVictory(w) {
  const red  = w.entities.buildingsOf('red').filter(b => b.kind !== 'goldMine');
  const blue = w.entities.buildingsOf('blue').filter(b => b.kind !== 'goldMine');
  if (red.length === 0)       w.state.gameOver = 'blue';
  else if (blue.length === 0) w.state.gameOver = 'red';
}
