// ORCHESTRATOR: program entry point. Boots the world, drives the RAF loop, owns the
// game-over overlay and restart wiring. This and src/core/* are the only files a human
// needs to read to understand the high-level flow.

import { CONFIG }           from './core/config.js';
import { createWorld }      from './core/world.js';
import { tick, TICK_DT }    from './core/game-loop.js';

window.addEventListener('load', () => {
  let world;

  function restart() {
    world.entities.spawnInitial();
    world.ai.resetAI();
    document.getElementById('game-over').style.display = 'none';
    world.input.refreshBuildButtons();
    world.input.refreshTrainMenu();
  }

  world = createWorld(CONFIG, { onRestart: restart });

  world.entities.spawnInitial();
  world.input.initInput();
  world.render.initRender();
  world.input.refreshBuildButtons();
  world.input.refreshTrainMenu();
  world.ai.resetAI();

  let last = performance.now();
  let acc = 0;
  let overlayShown = false;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= TICK_DT) { tick(world, TICK_DT); acc -= TICK_DT; }
    world.render.draw();

    if (world.state.gameOver && !overlayShown) {
      showGameOverOverlay(world.state.gameOver);
      overlayShown = true;
    } else if (!world.state.gameOver && overlayShown) {
      overlayShown = false;
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

function showGameOverOverlay(winner) {
  const overlay = document.getElementById('game-over');
  document.getElementById('game-over-text').textContent =
    (winner === 'red' ? 'Victory!' : 'Defeat.') + ' (' + winner + ' wins)';
  overlay.style.display = '';
}
