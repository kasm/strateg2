// ORCHESTRATOR: client (browser) bootstrap.
// Builds the headless sim via sim/index.js, wires up the client-only modules (clientState,
// render, input), and owns the RAF loop + game-over overlay. The sim module knows
// nothing about the DOM; everything DOM-shaped lives here.

import { CONFIG }              from '../core/config.js';
import { createSimWorld, spawnInitial, stepTick, TICK_DT } from '../sim/index.js';
import { createClientState }   from './client-state.js';
import { createLocalTransport } from '../transport/local.js';
import { createRender }        from '../modules/render/index.js';
import { createInput }         from '../modules/input/index.js';

export function startClient() {
  const sim       = createSimWorld(CONFIG);
  const client    = createClientState();
  const transport = createLocalTransport(sim);

  function restart() {
    spawnInitial(sim);
    client.selectedIds.length = 0;
    client.buildMode = null;
    client.trainFromId = null;
    document.getElementById('game-over').style.display = 'none';
    input.refreshBuildButtons();
    input.refreshTrainMenu();
  }

  const input = createInput({
    state:       sim.state,
    client,
    config:      sim.config,
    map:         sim.map,
    entities:    sim.entities,
    units:       sim.units,
    pathfinding: sim.pathfinding,
    transport,
    onRestart:   restart,
  });
  const render = createRender({
    state:    sim.state,
    client,
    config:   sim.config,
    map:      sim.map,
    entities: sim.entities,
    getDragRect: input.getDragRect,
  });

  spawnInitial(sim);
  input.initInput();
  render.initRender();
  input.refreshBuildButtons();
  input.refreshTrainMenu();

  let last = performance.now();
  let acc = 0;
  let overlayShown = false;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= TICK_DT) { stepTick(sim, TICK_DT); acc -= TICK_DT; }
    render.draw();

    if (sim.state.gameOver && !overlayShown) {
      showGameOverOverlay(sim.state.gameOver);
      overlayShown = true;
    } else if (!sim.state.gameOver && overlayShown) {
      overlayShown = false;
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function showGameOverOverlay(winner) {
  const overlay = document.getElementById('game-over');
  document.getElementById('game-over-text').textContent =
    (winner === 'red' ? 'Victory!' : 'Defeat.') + ' (' + winner + ' wins)';
  overlay.style.display = '';
}
